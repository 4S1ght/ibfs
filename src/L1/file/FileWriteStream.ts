// Imports =============================================================================================================

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

    private readonly handle:                  FileHandle
    private readonly blockSize:               number
    private readonly fbmCommitFrequency:      number
    private          currentBlock:            number

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

    constructor(handle: FileHandle, options: TFWSOptions) {

        super({
            highWaterMark: options.highWaterMark || KB_64
        })

        this.blockSize =  handle.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE

        this.fileWriteOffset          = options.offset || 0
        this.firstBlock               = Math.floor(this.fileWriteOffset / this.blockSize)
        this.firstBlockOffset         = this.fileWriteOffset % this.blockSize
        this.firstBlockAffectedRegion = this.blockSize - this.firstBlockOffset
        this.fbmCommitFrequency       = options.fbmCommitFrequency || 16

        this.currentBlock             = this.firstBlock
        this.handle                   = handle
        this.longCache                = Memory.allocUnsafe(this.blockSize)

        // If starting from beginning of a block, turn to long mode
        if (this.firstBlockOffset == 0) this.mode = 'long'
        // If starting outside of file boundary, throw an error
        if (this.fileWriteOffset > this.handle.originalLength) 
            throw new IBFSError('L1_FH_WRITE_STREAM_OUTRANGE', null, null, { outBy: this.fileWriteOffset - this.handle.originalLength })

    }

    private async writeChunk(chunk: Buffer): Promise<Error | undefined> {
        try {
            
            const fs = this.handle.fbm.containingFilesystem
            const views = createBufferMultiview(chunk, this.blockSize, this.longCache.spaceLeft)

            // First chunk
            this.longCache.write(views.firstChunk)

            if (this.longCache.spaceLeft === 0) {
                const writeError = await fs.volume.writeDataBlock({
                    data: this.longCache.buffer,
                    aesKey: fs.aesKey,
                    address: this.getCurrentBlockAddress()
                })
                if (writeError) throw writeError
                this.longCache.reset()
            }

            // Mid-chunks (full blocks)
            for (const chunk of views.chunks) {
                const writeError = await fs.volume.writeDataBlock({
                    data: chunk,
                    aesKey: fs.aesKey,
                    address: this.getCurrentBlockAddress()
                })
                if (writeError) throw writeError
            }

            // Cache remaining data not eligible for a full block overwrite
            if (views.lastChunk) {
                this.longCache.write(views.lastChunk)
            }

            // Commit changes to the FBM
            if (this.longAddresses.length >= this.fbmCommitFrequency) {
                const error = await this.handle.fbm.append(this.longAddresses)
                if (error) throw error
                this.longAddresses.length = 0
            }
        } 
        catch (error) {
            this.longAddresses.forEach(address => this.handle.fbm.containingFilesystem.adSpace.free(address))
            return error as Error
        }
    } 

    private getCurrentBlockAddress() {

        let address = this.handle.fbm.get(this.currentBlock)

        if (!address) {
            const newAddress = this.handle.fbm.containingFilesystem.adSpace.alloc()
            this.longAddresses.push(newAddress)
            address = newAddress
        }

        this.currentBlock++
        return address

    }

    override async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        if (this.mode === 'short') {
            const err = await this._first(chunk)
            callback(err)
            return;
        }
        else {
            const error = await this.writeChunk(chunk)
            callback(error)
        }
    }

    private async _first(incomingChunk: Buffer): Promise<Error | undefined> {
        try {

            this.shortChunks.push(incomingChunk)
            const totalChunks = this.shortChunks.reduce((acc, val) => acc + val.length, 0)

            if (totalChunks >= this.firstBlockAffectedRegion) {

                const fs = this.handle.fbm.containingFilesystem

                const firstBlockAddress = this.getCurrentBlockAddress()
                const [readError, firstBlock] = await fs.volume.readDataBlock(firstBlockAddress, fs.aesKey)
                if (readError) return new IBFSError('L1_FH_WRITE_STREAM_FIRST', null, readError, { address: firstBlockAddress })
                
                const data = Memory.alloc(this.blockSize)
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
                for (const chunk of this.shortChunks) await this.writeChunk(chunk)
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
    
            const fs = this.handle.fbm.containingFilesystem
    
            // Index X to X (closed still in init mode)
            if (this.mode === 'short' && this.shortChunks.length > 0 && this.shortChunks[0]!.length > 0) {
    
                const firstBlockAddress = this.getCurrentBlockAddress()
                const [readError, firstBlock] = await fs.volume.readDataBlock(firstBlockAddress, fs.aesKey)
                if (readError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, readError, { address: firstBlockAddress })
                
                const data = Memory.alloc(this.blockSize)
                data.write(firstBlock.data)
                data.bytesWritten = this.firstBlockOffset
                
                // Compose first affected block's body
                while (this.shortChunks.length > 0) {
                    const chunk = this.shortChunks.shift()!
                    data.write(chunk)
                }
                // Overwrite the first block
                const writeError = await fs.volume.writeDataBlock({
                    data: data.readFilled(),
                    aesKey: fs.aesKey,
                    address: firstBlockAddress
                })
                if (writeError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, writeError, { address: firstBlockAddress })
            }
    
            // Index 0 to X (closed in long mode)
            if (this.mode === 'long' && this.longCache.bytesWritten > 0) {
                
                const address = this.getCurrentBlockAddress()
                const shouldMerge = !!this.handle.fbm.get(this.currentBlock - 1)
                const block = Memory.alloc(this.blockSize)
                let finalBlockSize = 0
                
                if (shouldMerge) {
                    const [readError, finalBlock] = await fs.volume.readDataBlock(address, fs.aesKey)
                    if (readError) throw new IBFSError('L1_FH_WRITE_STREAM_FINAL', null, readError, { address })
                    block.write(finalBlock.data)
                    finalBlockSize = finalBlock.data.length
                }

                block.write(this.longCache.readFilled(), 0)
                block.bytesWritten = Math.max(finalBlockSize, this.longCache.bytesWritten)

                const writeError = await fs.volume.writeDataBlock({
                    data: block.readFilled(),
                    aesKey: this.handle.fbm.containingFilesystem.aesKey,
                    address
                })
                if (writeError) throw writeError

                const appendError = await this.handle.fbm.append(this.longAddresses)
                if (appendError) throw appendError

                this.longCache.reset()
                this.longAddresses = []

            }
    
            callback()
    
        } 
        catch (error) {
            this.longAddresses.forEach(address => this.handle.fbm.containingFilesystem.adSpace.free(address))
            callback(error as Error)
        }
    }

}