// Imports =============================================================================================================

import type * as T from '../../../types.js'

import Memory from '../../L0/Memory.js'
import IBFSError from '../../errors/IBFSError.js'
import FileBlockMap, { TFBMOpenOptions } from './FileBlockMap.js'

import ssc from '../../misc/safeShallowCopy.js'
import { Readable } from 'node:stream'

// Types ===============================================================================================================

/** 
 * File descriptor open options.
*/
export interface TFHOpenOptions extends TFBMOpenOptions {

}

// Exports =============================================================================================================

export default class FileHandle {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** File's top-level block map. */ public readonly declare fbm: FileBlockMap

    // Factory ---------------------------------------------------------------------------------------------------------

    private constructor() {}

    /**
     * Opens an IBFS file descriptor.
     * @param options 
     * @returns FileHandle
     */
    public static async open(options: TFHOpenOptions): T.XEavA<FileHandle, 'L1_FD_OPEN'> {
        try {

            const self = new this()

            // Check file locks -------------------
            // TODO

            // Lock file --------------------------
            // TODO

            // Load FBM ---------------------------

            const [fbmError, fbm] = await FileBlockMap.open(options)
            if (fbmError) return IBFSError.eav('L1_FD_OPEN', null, fbmError, ssc(options, ['containingFilesystem']));
            (self as any).fbm = fbm

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FD_OPEN', null, error as Error)
        }
    }

    /** Returns the type of the file structure. */
    public get type() { return this.fbm.root.resourceType }
    /** The time the file was created. */
    public get created() { return this.fbm.root.created }
    /** The time the file was last modified. */
    public get modified() { return this.fbm.root.modified }

    // Lifecycle -------------------------------------------------------------------------------------------------------

    public async close() {

        // Lift the lock ----------------------------
        // TODO

        // Remove reference from open files list ----
    }

    // I/O methods -----------------------------------------------------------------------------------------------------

    public async readFull(integrity = true): T.XEavA<Buffer, 'L1_FD_READ'> {
        try {

            const bufferSize = this.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE * this.fbm.length
            const buffer = Memory.alloc(bufferSize)
            let length = 0

            for (const [, address] of this.fbm.dataAddresses()) {
                const [readError, dataBlock] = await this.fbm.containingFilesystem.volume.readDataBlock(address, this.fbm.containingFilesystem.aesKey, integrity)
                if (readError) return IBFSError.eav('L1_FD_READ', null, readError, { dataBlockAddress: address })

                length += dataBlock.length
                buffer.write(dataBlock.data)
            }

            return [null, buffer.read(length)]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FD_READ', null, error as Error)
        }
    }

    public async writeFull() {}

    public async append() {}

    public async truncate() {}

    /**
     * Creates a readable stream of the file's contents.
     * @param start Starting byte (inclusive)
     * @param end Ending byte (exclusive)
     * @param integrity Whether to perform integrity checks
     * @returns [Error?, Readable?]
     */
    public async createReadStream(start: number = 0, end: number = Infinity, integrity = true): 
        T.XEavA<Readable, 'L1_FG_READ_STREAM'|"L1_FG_READ_STREAM_BUFFER"|"L1_FG_READ_STREAM_OUTRANGE"> {
        try {

            if (start <= end) return IBFSError.eav('L1_FG_READ_STREAM_OUTRANGE', null, null, { start, end })

            const stream = new Readable({})
            const startBlock = Math.floor(start / this.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE)
            const startOffset = start % this.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE
            let bytesToRead = end - start
            let firstRead = true

            process.nextTick(async () => {
                try {
                    for (const [i, address] of this.fbm.dataAddresses()) {

                        // Skip prepending blocks
                        if (i < startBlock) { continue }
                        let shouldDrain = false

                        const [readError, dataBlock] = await this.fbm.containingFilesystem.volume.readDataBlock(address, this.fbm.containingFilesystem.aesKey, integrity)
                        if (readError) return IBFSError.eav('L1_FG_READ_STREAM_BUFFER', null, readError, { dataBlockAddress: address })

                        const data = dataBlock.data.subarray(firstRead ? startOffset : 0, bytesToRead)
                        firstRead = false
                        bytesToRead -= data.length
                        shouldDrain = stream.push(data)

                        if (shouldDrain) await new Promise<void>(resolve => stream.once('drain', resolve))
                        if (bytesToRead <= 0 ) break

                    }

                    // End stream
                    stream.push(null)

                } 
                catch (error) {
                    stream.emit('error', error)
                }
            })

            return [null, stream]

        } 
        catch (error) {
            return IBFSError.eav('L1_FG_READ_STREAM', null, error as Error)
        }
    }

    public async createWriteStream() {}

    // Helpers ---------------------------------------------------------------------------------------------------------

}