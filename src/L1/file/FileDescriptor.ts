// Imports =============================================================================================================

import type * as T from '../../../types.js'

import IBFSError from '../../errors/IBFSError.js'
import Filesystem from '../Filesystem.js'
import FileBlockMap, { TFBMOpenOptions } from './FileBlockMap.js'

import ssc from '../../misc/safeShallowCopy.js'
import Memory from '../../L0/Memory.js'

// Types ===============================================================================================================

/** 
 * File descriptor open options.
*/
export interface TFDOpenOptions extends TFBMOpenOptions {

}

// Exports =============================================================================================================

export default class FileDescriptor {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** File's top-level block map. */ public readonly declare fbm: FileBlockMap

    // Factory ---------------------------------------------------------------------------------------------------------

    private constructor() {}

    /**
     * Opens an IBFS file descriptor.
     * @param options 
     * @returns FileDescriptor
     */
    public static async open(options: TFDOpenOptions): T.XEavA<FileDescriptor, 'L1_FD_OPEN'> {
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

            for (const address of this.fbm.dataAddresses()) {
                const [readError, dataBlock] = await this.fbm.containingFilesystem.volume.readDataBlock(address, this.fbm.containingFilesystem.aesKey, integrity)
                if (readError) return IBFSError.eav('L1_FD_READ', null, readError, { dataBlockAddress: address })

                length = dataBlock.length
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

    public async createReadStream() {}

    public async createWriteStream() {}

}