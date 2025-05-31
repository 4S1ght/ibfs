// Imports =============================================================================================================

import type * as T from "../../../types.js"
import { Writable } from "node:stream"
import FileHandle from "./FileHandle.js"
import Memory from "../../L0/Memory.js"
import IBFSError from "../../errors/IBFSError.js"
import { createBufferMultiview } from "../../misc/bufferMultiView.js"
import { KB_64 } from "../../Constants.js"

// Types ===============================================================================================================

export interface TFWSOptions {
    /**
     * Offset at which to start writing the file.
     * @default 0
     */
    offset?: number
    /** 
     * The watermark below which the stream will request more data.
     * @default 65536 // 64 kB
     */ 
    highWaterMark?: number
    /**
     * Represents every how many data blocks written their addresses
     * are committed to the file's block map to persist the changes.
     * 
     * Lower numbers will result in more redundant writes and slower throughput.
     * Any remaining in-flight changes are committed when the stream is closed.
     * @default 16
     */
    fbmCommitFrequency?: number
}

// Exports =============================================================================================================

export default class FileWriteStream extends Writable {

    public  readonly _handle:                  FileHandle
    private readonly _blockSize:               number
    public  readonly _fbmCommitFrequency:      number
    public           _currentBlock:            number

    public readonly fileWriteOffset:          number
    public readonly firstBlock:               number
    public readonly firstBlockOffset:         number
    public readonly firstBlockAffectedRegion: number

    /** 
     * Used during initialization only.
     * Stores chunks of data until there is enough to overwrite the full affected
     * length of the first affected block, then all writes are done to the cache
     * and each block overwritten when the cache is filled.
     */
    private shortChunks: Buffer[] = []
    /**
     * Caches data between incomplete writes in long mode.
     * This cache represents an incomplete block.
     */
    private longCache: Memory
    /**
     * Temporarily stores addresses of blocks written in long mode.
     */
    private longAddresses: number[] = []

    private mode: 'short' | 'long' = 'short'

    private constructor(handle: FileHandle, options: TFWSOptions) {

        super({
            highWaterMark: options.highWaterMark || KB_64
        })

        this._blockSize =  handle.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE

        this.fileWriteOffset          = options.offset || 0
        this.firstBlock               = Math.floor(this.fileWriteOffset / this._blockSize)
        this.firstBlockOffset         = this.fileWriteOffset % this._blockSize
        this.firstBlockAffectedRegion = this._blockSize - this.firstBlockOffset
        this._fbmCommitFrequency       = options.fbmCommitFrequency || 16

        this._currentBlock            = this.firstBlock
        this._handle                  = handle
        this.longCache                = Memory.allocUnsafe(this._blockSize)

        // If starting from beginning of a block, turn to long mode
        if (this.firstBlockOffset == 0) this.mode = 'long'

    }

    public static async open(handle: FileHandle, options: TFWSOptions): T.XEavA<FileWriteStream, 'L1_FH_WRITE_STREAM_OPEN'|'L1_FH_WRITE_STREAM_OUTRANGE'> {
        try {

            const self = new this(handle, options)

            const [lenError, fileLength] = await handle.getFileLength()
            if (lenError) return IBFSError.eav('L1_FH_WRITE_STREAM_OPEN', null, lenError)
            if (self.fileWriteOffset > fileLength) return IBFSError.eav('L1_FH_WRITE_STREAM_OUTRANGE', null, null, { readOffset: self.fileWriteOffset, fileLength })

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_WRITE_STREAM_OPEN', null, error as Error)
        }
    }

    private async _writeChunk(chunk: Buffer): Promise<Error | undefined> {
        try {
            
            const fs = this._handle.fbm.containingFilesystem
            const views = createBufferMultiview(chunk, this._blockSize, this.longCache.spaceLeft)

            // First chunk
            this.longCache.write(views.firstChunk)

            if (this.longCache.spaceLeft === 0) {
                const writeError = await fs.volume.writeDataBlock({
                    data: this.longCache.buffer,
                    aesKey: fs.aesKey,
                    address: this._getCurrentBlockAddress()
                })
                if (writeError) throw writeError
                this.longCache.reset()
            }

            // Mid-chunks (full blocks)
            for (const chunk of views.chunks) {
                const writeError = await fs.volume.writeDataBlock({
                    data: chunk,
                    aesKey: fs.aesKey,
                    address: this._getCurrentBlockAddress()
                })
                if (writeError) throw writeError
            }

            // Cache remaining data not eligible for a full block overwrite
            if (views.lastChunk) {
                this.longCache.write(views.lastChunk)
            }

            // Commit changes to the FBM
            if (this.longAddresses.length >= this._fbmCommitFrequency) {
                const error = await this._handle.fbm.append(this.longAddresses)
                if (error) throw error
                this.longAddresses.length = 0
            }
        } 
        catch (error) {
            this.longAddresses.forEach(address => this._handle.fbm.containingFilesystem.adSpace.free(address))
            return error as Error
        }
    } 

    private _getCurrentBlockAddress() {

        let address = this._handle.fbm.get(this._currentBlock)

        if (!address) {
            const newAddress = this._handle.fbm.containingFilesystem.adSpace.alloc()
            this.longAddresses.push(newAddress)
            address = newAddress
        }

        this._currentBlock++
        return address

    }

    override async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        if (this.mode === 'short') {
            const err = await this._first(chunk)
            callback(err)
            return;
        }
        else {
            const error = await this._writeChunk(chunk)
            callback(error)
        }
    }

    private async _first(incomingChunk: Buffer): Promise<Error | undefined> {
        try {

            this.shortChunks.push(incomingChunk)
            const totalChunks = this.shortChunks.reduce((acc, val) => acc + val.length, 0)

            if (totalChunks >= this.firstBlockAffectedRegion) {

                const fs = this._handle.fbm.containingFilesystem

                const firstBlockAddress = this._getCurrentBlockAddress()
                const [readError, firstBlock] = await fs.volume.readDataBlock(firstBlockAddress, fs.aesKey)
                if (readError) return new IBFSError('L1_FH_WRITE_STREAM_FIRST', null, readError, { address: firstBlockAddress })
                
                const data = Memory.alloc(this._blockSize)
                data.write(firstBlock.data)
                data.bytesWritten = this.firstBlockOffset
                
                // Compose first affected block's body
                while (data.spaceLeft) {
                    const chunk = this.shortChunks.shift()!
                    // Enough space for chunk:
                    if (chunk.length <= data.spaceLeft) {
                        data.write(chunk)
                    }
                    // Not enough space for chunk:
                    else {
                        const toWrite = chunk.subarray(0, data.spaceLeft)
                        const toDefer = chunk.subarray(data.spaceLeft)
                        data.write(toWrite)
                        this.shortChunks.unshift(toDefer)
                    }
                }
                // Overwrite the first block
                const writeError = await fs.volume.writeDataBlock({
                    data: data.buffer,
                    aesKey: fs.aesKey,
                    address: firstBlockAddress
                })
                if (writeError) return new IBFSError('L1_FH_WRITE_STREAM_FIRST', null, writeError, { address: firstBlockAddress })
                
                this.mode = 'long'

                // Write chunks to subsequent blocks and move to long mode.
                for (const chunk of this.shortChunks) await this._writeChunk(chunk)
                this.shortChunks = []
        
            }
        } 
        catch (error) {
            return new IBFSError('L1_FH_WRITE_STREAM_FIRST', null, error as Error)
        }
    }

    override async _final(callback: (err?: Error) => void) {
        try {
    
            if (this.mode === 'short' && this.shortChunks.length === 0) return callback()
            if (this.mode === 'long' && this.longCache.bytesWritten === 0) return callback()

            const fs = this._handle.fbm.containingFilesystem
    
            // Index X to X (closed still in init mode)
            if (this.mode === 'short' && this.shortChunks.length > 0 && this.shortChunks[0]!.length > 0) {
    
                const firstBlockAddress = this._getCurrentBlockAddress()
                const [readError, firstBlock] = await fs.volume.readDataBlock(firstBlockAddress, fs.aesKey)
                if (readError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, readError, { address: firstBlockAddress })
                
                const data = Memory.alloc(this._blockSize)
                data.write(firstBlock.data)
                data.bytesWritten = this.firstBlockOffset
                
                // Compose first affected block's body
                while (this.shortChunks.length > 0) {
                    const chunk = this.shortChunks.shift()!
                    data.write(chunk)
                }

                // Overwrite the first block
                const finalLength = Math.max(data.bytesWritten, firstBlock.data.length)
                const writeError = await fs.volume.writeDataBlock({
                    data: data.read(finalLength, 0),
                    aesKey: fs.aesKey,
                    address: firstBlockAddress
                })
                if (writeError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, writeError, { address: firstBlockAddress })
            
            }
    
            // Index 0 to X (closed in long mode)
            if (this.mode === 'long' && this.longCache.bytesWritten > 0) {
                
                const address = this._getCurrentBlockAddress()
                const shouldMerge = !!this._handle.fbm.get(this._currentBlock - 1)
                const block = Memory.alloc(this._blockSize)

                const incomingData = this.longCache.readFilled()
                let   existingData = Buffer.alloc(0)
                
                if (shouldMerge) {
                    const [readError, finalBlock] = await fs.volume.readDataBlock(address, fs.aesKey)
                    if (readError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, readError, { address })
                    existingData = finalBlock.data
                }

                block.write(existingData, 0)
                block.write(incomingData, 0)

                const finalLength = Math.max(existingData.length, incomingData.length)
                const finalData   = block.read(finalLength, 0)

                const writeError = await fs.volume.writeDataBlock({
                    data: finalData,
                    aesKey: this._handle.fbm.containingFilesystem.aesKey,
                    address
                })
                if (writeError) throw writeError

                const appendError = await this._handle.fbm.append(this.longAddresses)
                if (appendError) throw appendError

                this.longCache.reset()
                this.longAddresses = []

            }
    
            callback()
    
        } 
        catch (error) {
            this.longAddresses.forEach(address => this._handle.fbm.containingFilesystem.adSpace.free(address))
            callback(error as Error)
        }
    }

}