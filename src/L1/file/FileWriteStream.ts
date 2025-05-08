// Imports =============================================================================================================

import { Writable } from "node:stream"
import FileHandle from "./FileHandle.js"
import Memory from "../../L0/Memory.js"

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
}

// Exports =============================================================================================================

export default class FileWriteStream extends Writable {

    private readonly handle: FileHandle
    public  readonly writeOffset: number

    private cache: Memory

    constructor(handle: FileHandle, options: TFWSOptions) {

        super({
            highWaterMark: options.highWaterMark
        })

        this.handle      = handle
        this.writeOffset = options.offset || 0
        this.cache       = Memory.allocUnsafe(this.handle.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE)

    }

    private _doneFirst = false

    /**
     * Prepares the write stream for writing data.
     * This includes reading the first affected block to merge the written data
     * with the existing data.
     */
    private async _first() {
        this._doneFirst = true
    }

    override async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        try {

            if (!this._doneFirst) await this._first()
            
        } 
        catch (error) {
            callback(error as Error)
        }
    }


    override async _final(callback: (err?: Error) => void) {
        try {
            
        } 
        catch (error) {
            callback(error as Error)
        }

    }

}