// Imports =============================================================================================================

import type * as T from "../../../types.js"
import { Readable } from "node:stream";
import { KB_64 } from "../../Constants.js";
import FileHandle from "./FileHandle.js";
import IBFSError from "../../errors/IBFSError.js";

// Types ===============================================================================================================

export interface TFRSOptions {
    /** 
     * Offset at which to start reading the file.
     * @default 0
     */
    offset?: number
    /** 
     * End at which to stop reading the file. 
     * @default Infinity // (Full file read)
     */                   
    length?: number
    /** 
     * Whether to perform data integrity checks. 
     * If set to false, data integrity checks will be skipped.
     * Use this only only for data recovery or if you know what you're doing.
     * @default true
     */                
    integrity?: boolean
    /** 
     * The size of individual data chunks pushed to the stream. 
     * @default 65536 // 64 kB
     */ 
    maxChunkSize?: number
    /** 
     * The watermark below which the stream will request more data.
     * @default 65536 // 64 kB
     */ 
    highWaterMark?: number
}

// Exports =============================================================================================================

export default class FileReadStream extends Readable {

    public  readonly _handle:        FileHandle
    private readonly _reader:        AsyncGenerator<Buffer>

    public  readonly _readOffset:    number
    public  readonly _readLength:    number
    public  readonly _integrity:     boolean
    public  readonly _maxChunkSize:  number

    private constructor(handle: FileHandle, options: TFRSOptions) {

        super({
            highWaterMark: options.maxChunkSize || KB_64,
        })

        this._handle       = handle
        this._readOffset   = options.offset       || 0
        this._readLength   = options.length       || Infinity
        this._integrity    = options.integrity    || true
        this._maxChunkSize = options.maxChunkSize || KB_64

        this._reader       = this.createBlockReader()

    }

    public static async open(handle: FileHandle, options: TFRSOptions): T.XEavA<FileReadStream, 'L1_FH_READ_STREAM_OPEN'|'L1_FH_READ_STREAM_OUTRANGE'> {
        try {

            const self = new this(handle, options)

            const [lenError, fileLength] = await handle.getFileLength()
            if (lenError) return IBFSError.eav('L1_FH_READ_STREAM_OPEN', null, lenError)
            if (self._readOffset > fileLength) return IBFSError.eav('L1_FH_READ_STREAM_OUTRANGE', null, null, { readOffset: self._readOffset, fileLength })

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ_STREAM_OPEN', null, error as Error)
        }
    }

    /**
     * Reads data from the file and pushes it to the stream
     * chunk by chunk, depending on the specified or default
     * chunk size.
     */
    private async *createBlockReader(): AsyncGenerator<Buffer> {

        const fs          = this._handle.fbm.containingFilesystem

        const startBlock  = Math.floor(this._readOffset / fs.volume.bs.DATA_CONTENT_SIZE)
        const startOffset = this._readOffset % fs.volume.bs.DATA_CONTENT_SIZE
        let   bytesToRead = this._readLength
        let   firstRead   = true

        for (const address of this._handle.fbm.dataAddresses(startBlock)) {

            const [readError, dataBlock] = await fs.volume.readDataBlock(address, fs.aesKey, this._integrity)
            if (readError) throw IBFSError.eav('L1_FH_READ_STREAM_BUFFER', null, readError, { dataBlockAddress: address })

            const data = firstRead 
                ? dataBlock.data.subarray(startOffset, startOffset + bytesToRead)
                : dataBlock.data

            bytesToRead -= data.length
            firstRead = false

            yield* this.createChunkReader(data)
            if (bytesToRead <= 0) break

        }

    }

    /**
     * Loops over the `buffer` and yields it chunk by chunk.
     * Used to split the data read from the file into smaller chunks
     * to prevent copying of large data blocks at once and overwhelming
     * the internal stream buffer.
     */
    private *createChunkReader(buffer: Buffer): Generator<Buffer> {

        let offset = 0

        while (offset < buffer.length) {
            yield buffer.subarray(offset, offset + this._maxChunkSize)
            offset += this._maxChunkSize
        }

    }

    private _isReading = false
    override async _read(size: number) {

        if (this._isReading) return
        this._isReading = true
        let dataLeft = size

        try {
            while (dataLeft > 0) {
                const { value, done } = await this._reader.next()
                if (done) {
                    this.push(null)
                    break
                }
                else {
                    this.push(value)
                }
                dataLeft -= value.length
            }
            this._isReading = false   
        } 
        catch (error) {
            this.destroy(error as Error)
        }

    }

    override [Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
        return super[Symbol.asyncIterator]() as AsyncIterableIterator<Buffer>;
    }

}