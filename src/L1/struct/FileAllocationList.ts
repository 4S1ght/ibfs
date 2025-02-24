// Imports ============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlock, TLinkBlock }   from '../../L0/BlockSerialization.js'

// Types ==============================================================================================================

export interface TFALOpenOptions {
    /** Reference to the containing filesystem. */ fsRef:        FilesystemContext
    /** Address of FAL's head block.            */ headAddress:  number
    /** AES encryption key.                     */ aesKey:       Buffer
    /** Enables/disables integrity checks.      */ integrity?:   boolean
}

// Exports ============================================================================================================

export default class FileAllocationList {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare fsRef:           FilesystemContext
    /** Address of FAL's head block.            */ private declare startingAddress: number
    /** AES encryption key.                     */ private declare aesKey:          Buffer

    // Factory -----------------------------------------------------------------------------

    /** 
     * Stores all the address blocks inside the file allocation list.  
     * First index always stores the head block which is followed by `N` link blocks.
     */ 
    public declare addressBlocks: [THeadBlock, ...TLinkBlock[]]

    /**
     * Opens the file allocation list.  
     * A FAL must only be opened on an already initialized file, meaning there has to be a starting head
     * block. This design choice is there to ensure no FAL is loaded with leftover link blocks that
     * may have been left after soft file deletions or due to hanging pointers.
     */
    public static async open(options: TFALOpenOptions): T.XEavA<FileAllocationList, "L1_FAL_OPEN"|"L1_FAL_OPEN_CIRC"> {
        try {
            
            const self = new this()

            self.fsRef           = options.fsRef
            self.startingAddress = options.headAddress
            self.aesKey          = options.aesKey

            // Load head block ----------------------------

            const [headError, head] = await self.fsRef.volume.readHeadBlock(self.startingAddress, self.aesKey)
            if (headError) return IBFSError.eav('L1_FAL_OPEN', null, headError, ssc(options, ['aesKey']))
            self.addressBlocks = [head]

            // Load link blocks  -------------------------

            const visited = new Set<number>()
            let nextAddress = self.addressBlocks[0].next
            
            while (nextAddress !== 0) {

                // Prevents an infinite loop in cases of a circular pointer
                if (visited.has(nextAddress)) return IBFSError.eav(
                    'L1_FAL_OPEN_CIRC', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: nextAddress }
                )

                const [linkError, link] = await self.fsRef.volume.readLinkBlock(nextAddress, self.aesKey)
                if (linkError) {
                    return IBFSError.eav(
                        'L1_FAL_OPEN',
                        'open() scan failed due to link read error. ',
                        linkError,
                        { blockAddress: nextAddress }
                    )
                }

                self.addressBlocks.push(link)
                visited.add(nextAddress)
                nextAddress = link.next
                
            }

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FAL_OPEN', null, error as Error)
        }
    }

}