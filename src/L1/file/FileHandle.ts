// Imports =============================================================================================================

import type * as T from '../../../types.js'

import Memory from '../../L0/Memory.js'
import IBFSError from '../../errors/IBFSError.js'
import FileBlockMap, { TFBMOpenOptions } from './FileBlockMap.js'

import ssc from '../../misc/safeShallowCopy.js'
import FileReadStream from './FileReadStream.js'

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
    public static async open(options: TFHOpenOptions): T.XEavA<FileHandle, 'L1_FH_OPEN'> {
        try {

            const self = new this()

            // Check file locks -------------------
            // TODO

            // Lock file --------------------------
            // TODO

            // Load FBM ---------------------------

            const [fbmError, fbm] = await FileBlockMap.open(options)
            if (fbmError) return IBFSError.eav('L1_FH_OPEN', null, fbmError, ssc(options, ['containingFilesystem']));
            (self as any).fbm = fbm

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_OPEN', null, error as Error)
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

    /**
     * Reads the full contents of the file and returns the resulting buffer. 
     * This is potentially really memory intensive and should be avoided whenever 
     * dealing with large files.
     * @param integrity Whether to perform data integrity checks.
     * @returns [Error?, Buffer?]
     */
    public async readFull(integrity = true): T.XEavA<Buffer, 'L1_FH_READ'> {
        try {

            const bufferSize = this.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE * this.fbm.length
            const buffer = Memory.alloc(bufferSize)
            let length = 0

            for (const [, address] of this.fbm.dataAddresses()) {
                const [readError, dataBlock] = await this.fbm.containingFilesystem.volume.readDataBlock(address, this.fbm.containingFilesystem.aesKey, integrity)
                if (readError) return IBFSError.eav('L1_FH_READ', null, readError, { dataBlockAddress: address })

                length += dataBlock.length
                buffer.write(dataBlock.data)
            }

            return [null, buffer.read(length)]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ', null, error as Error)
        }
    }

    public async writeFull() {}

    public async append() {}

    public async truncate() {}

    /**
     * Creates a readable stream of the file's contents.  
     * **NOTE:** The returned stream is not inherently error-safe. It **CAN** throw errors
     * when reading from the file and should always be handled from within a try/catch block.
     * @param start Starting byte (inclusive)
     * @param end Ending byte (exclusive)
     * @param integrity Whether to perform integrity checks
     * @returns [Error?, Readable?]
     */
    public createReadStream(start: number = 0, end: number = Infinity, integrity = true): 
        T.XEav<FileReadStream, 'L1_FH_READ_STREAM'|"L1_FH_READ_STREAM_BUFFER"|"L1_FH_READ_STREAM_OUTRANGE"> {
        try {

            if (start >= end) return IBFSError.eav('L1_FH_READ_STREAM_OUTRANGE', null, null, { start, end })

            const stream = new FileReadStream(this, {
                start, end, integrity,
                maxChunkSize: this.fbm.containingFilesystem.volume.bs.DATA_CONTENT_SIZE
            })

            return [null, stream]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ_STREAM', null, error as Error)
        }
    }

    public async createWriteStream() {}

    // Helpers ---------------------------------------------------------------------------------------------------------

}