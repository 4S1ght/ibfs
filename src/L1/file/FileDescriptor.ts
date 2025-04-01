// Imports =============================================================================================================

import type * as T from '../../../types.js'

import IBFSError from '../../errors/IBFSError.js'
import Filesystem from '../Filesystem.js'
import FileBlockMap, { TFBMOpenOptions } from './FileBlockMap.js'

import ssc from '../../misc/safeShallowCopy.js'

// Types ===============================================================================================================

/** 
 * File descriptor open options.
*/
export interface TFDOpenOptions extends TFBMOpenOptions {

}

// Exports =============================================================================================================

export default class FileDescriptor {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** File's top-level block map. */ private declare fbm: FileBlockMap

    // Factory ---------------------------------------------------------------------------------------------------------

    private constructor() {}

    /**
     * Opens an IBFS file descriptor.
     * @param options 
     * @returns FileDescriptor
     */
    public static async openFileDescriptor(options: TFDOpenOptions): T.XEavA<FileDescriptor, 'L1_FD_OPEN'> {
        try {

            const self = new this()

            // Check file locks -------------------
            // TODO

            // Lock file --------------------------
            // TODO

            // Load FBM ---------------------------

            const [fbmError, fbm] = await FileBlockMap.open(options)
            if (fbmError) return IBFSError.eav('L1_FD_OPEN', null, fbmError, ssc(options, ['aesKey']))
            self.fbm = fbm

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FD_OPEN', null, error as Error)
        }
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    public async close() {}



}