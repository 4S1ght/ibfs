// Imports =============================================================================================================

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
    start?: number
    /** 
     * End at which to stop reading the file. 
     * @default Infinity // (Full file read)
     */                   
    end?: number
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
}

// Exports =============================================================================================================

export default class FileReadStream extends Readable {

    private readonly handle:        FileHandle
    private readonly reader:        AsyncGenerator<Buffer>

    public  readonly start:         number
    public  readonly end:           number
    public  readonly integrity:     boolean
    public  readonly maxChunkSize:  number

    constructor(handle: FileHandle, options: TFRSOptions) {

        super()

        this.handle       = handle
        this.start        = options.start        || 0
        this.end          = options.end          || Infinity
        this.integrity    = options.integrity    || true
        this.maxChunkSize = options.maxChunkSize || KB_64

        this.reader       = this.createBlockReader()

    }

    /**
     * Reads data from the file and pushes it to the stream
     * chunk by chunk, depending on the specified or default
     * chunk size.
     */
    private async *createBlockReader(): AsyncGenerator<Buffer> {

        const fs    = this.handle.fbm.containingFilesystem
        const start = this.start
        const end   = this.end

        const startBlock  = Math.floor(start / fs.volume.bs.DATA_CONTENT_SIZE)
        const startOffset = start % fs.volume.bs.DATA_CONTENT_SIZE
        let   bytesToRead = end - start
        let   firstRead   = true

        for (const [i, address] of this.handle.fbm.dataAddresses()) {

            // Skip blocks before the start block
            if (i < startBlock) continue

            const [readError, dataBlock] = await fs.volume.readDataBlock(address, fs.aesKey, this.integrity)
            if (readError) throw IBFSError.eav('L1_FH_READ_STREAM_BUFFER', null, readError, { dataBlockAddress: address })

            const data = firstRead 
                ? dataBlock.data.subarray(startOffset, bytesToRead)
                : dataBlock.data

            bytesToRead -= data.length
            firstRead = false

            yield* this.createViewReader(data)
            if (bytesToRead <= 0) break

        }

    }

    /**
     * Loops over the `buffer` and yields it chunk by chunk.
     */
    private *createViewReader(buffer: Buffer): Generator<Buffer> {

        let offset = 0

        while (offset < buffer.length) {
            yield buffer.subarray(offset, offset + this.maxChunkSize)
            offset += this.maxChunkSize
        }

    }

    private _isReading = false
    override async _read(size: number) {

        if (this._isReading) return
        this._isReading = true
        let dataLeft = size

        try {
            while (dataLeft > 0) {
                const { value, done } = await this.reader.next()
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

}