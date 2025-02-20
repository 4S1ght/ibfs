// Imports =============================================================================================================

import type * as T      from '../../../types.js'
import ssc              from '../../misc/safeShallowCopy.js'

import IBFSError        from '../../errors/IBFSError.js'
import FilesystemContext from '../Filesystem.js'
import { THeadBlock, TLinkBlock }   from '../../L0/BlockSerialization.js'

// Types ===============================================================================================================

export interface TFALOpenOptions {
    /** Reference to the containing filesystem. */ fsRef:        FilesystemContext
    /** Address of FAL's head block.            */ headAddress:  number
    /** Describes how link blocks are loaded.   */ loadStrategy: 'eager' | 'lazy'
    /** AES encryption key.                     */ aesKey:       Buffer
}

// Exports =============================================================================================================

export default class FileAllocationList {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare fsRef:           FilesystemContext
    /** Address of FAL's head block.            */ private declare startingAddress: number
    /** Describes how link blocks are loaded.   */ private declare loadStrategy:    'eager' | 'lazy'
    /** AES encryption key.                     */ private declare aesKey:          Buffer

    // Computed --------------------------------------------------------------------------------------------------------

    /** References the live copy of FAL's head block. */ public declare head: THeadBlock
    /** Stores link blocks following the head block.  */ public declare links: TLinkBlock[]

    private constructor() {}

    // Factory ---------------------------------------------------------------------------------------------------------

    public static async open(options: TFALOpenOptions): T.XEavA<FileAllocationList, "L1_FAL_OPEN"> {
        try {
            
            const self = new this()

            self.fsRef           = options.fsRef
            self.startingAddress = options.headAddress
            self.loadStrategy    = options.loadStrategy
            self.aesKey          = options.aesKey

            const [headError, head] = await self.fsRef.volume.readHeadBlock(self.startingAddress, self.aesKey)
            if (headError) return IBFSError.eav('L1_FAL_OPEN', null, headError, ssc(options, ['aesKey']))
            self.head = head

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FAL_OPEN', null, error as Error)
        }
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    /** 
     * Scans the entire FAL and caches the link blocks. 
     */
    private async eagerScan() {
        try {
            
        } 
        catch (error) {
            
        }
    }

    /** 
     * Scans the FAL until the target address is found.
    */
    private async lazyScan(targetAddress: number) {}

    /**
     * Traverses the FAL until it reaches the target address, without caching any link blocks.
     * This method should be used primarily for random reads that are known to be rare and will not
     * benefit from extensive caching.
     */
    private async pinPoint(targetAddress: number) {}


    /** 
     * traverses (if needed) the entire FAL and truncates it by reclaiming all of its link and data block addresses.
     * This does not reclaim the head block's address as it may be needed later for files open in truncate mode.
     */
    private async truncate() {}

}