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

    /** References the live copy of FAL's head block. */ public declare head:  THeadBlock
    /** Stores link blocks following the head block.  */ public declare links: TLinkBlock[]

    private constructor() {}

    // Factory ---------------------------------------------------------------------------------------------------------

    /**
     * Opens the file allocation list.  
     * A FAL must only be opened on an already initialized file, meaning there has to be a starting head
     * block. This design choice is there to ensure no FAL is loaded with leftover link blocks that
     * may have been left after soft file deletions or due to hanging pointers.
     */
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
     * Scans all FAL blocks from within the volume and caches it in the `links` prop.
     */
    private async eagerScan(): T.XEavSA<"L1_FAL_SCAN_EAGER"> {
        try {

            const links: TLinkBlock[] = []
            const visited = new Set<number>()
            let nextAddress = this.head.next

            while (nextAddress !== 0) {

                // Prevents an infinite loop in cases of a circular pointer
                if (visited.has(nextAddress)) return new IBFSError(
                    'L1_FAL_SCAN_EAGER', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: nextAddress }
                )
                visited.add(nextAddress)

                const [linkError, link] = await this.fsRef.volume.readLinkBlock(nextAddress, this.aesKey)

                if (linkError) {
                    this.links = links
                    return new IBFSError(
                        'L1_FAL_SCAN_EAGER', 
                        'eagerScan failed gracefully due to link read error. ' +
                        'The FAL may therefore have only partially scanned.', 
                        linkError
                    )
                }

                links.push(link)
                nextAddress = link.next

            }

            this.links = links
            
        } 
        catch (error) {
            return new IBFSError('L1_FAL_SCAN_EAGER', null, error as Error)
        }
    }

    /** 
     * Scans the FAL until the target address is found.
    */
    private async lazyScan(targetAddress: number) {
        try {

        } 
        catch (error) {
            
        }
    }

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