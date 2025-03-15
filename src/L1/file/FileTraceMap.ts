// Imports ============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlock, TLinkBlock }   from '../../L0/BlockSerialization.js'

// Types ==============================================================================================================

// Types ==============================================================================================================

export interface TFTMOpenOptions {
    /** Reference to the containing filesystem. */ fsRef:        FilesystemContext
    /** Address of FTM's head block.            */ headAddress:  number
    /** AES encryption key.                     */ aesKey:       Buffer
    /** Enables/disables integrity checks.      */ integrity?:   boolean
}

// Exports ============================================================================================================

export default class FileTraceMap {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare fsRef:           FilesystemContext
    /** Address of FTM's head block.            */ private declare startingAddress: number
    /** AES encryption key.                     */ private declare aesKey:          Buffer

    // Factory -----------------------------------------------------------------------------

    /** 
     * Stores the deserialized index blocks belonging to the trace map.  
     * First position always stores the head block which is followed by `N` link blocks.
     */ 
    public declare addressBlocks: [THeadBlock, ...TLinkBlock[]]

    /**
     * Opens the file trace map.
     * A FTM must only be opened on an already initialized file, meaning there has to be a starting head
     * block. This design choice is there to ensure no FTM is loaded with leftover link blocks that
     * may have been left after soft file deletions or due to hanging pointers.
     */
    public static async open(options: TFTMOpenOptions): T.XEavA<FileTraceMap, "L1_FTM_OPEN"|"L1_FTM_OPEN_CIRC"> {
        try {
            
            const self = new this()

            self.fsRef           = options.fsRef
            self.startingAddress = options.headAddress
            self.aesKey          = options.aesKey

            // Load head block ----------------------------

            const [headError, head] = await self.fsRef.volume.readHeadBlock(self.startingAddress, self.aesKey)
            if (headError) return IBFSError.eav('L1_FTM_OPEN', null, headError, ssc(options, ['aesKey']))
            self.addressBlocks = [head]

            // Load link blocks  -------------------------

            const visited = new Set<number>()
            let nextAddress = self.addressBlocks[0].next
            
            while (nextAddress !== 0) {

                // Guards against infinite loops caused by potential circular pointers.
                if (visited.has(nextAddress)) return IBFSError.eav(
                    'L1_FTM_OPEN_CIRC', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: nextAddress }
                )

                const [linkError, link] = await self.fsRef.volume.readLinkBlock(nextAddress, self.aesKey)
                if (linkError) {
                    return IBFSError.eav(
                        'L1_FTM_OPEN',
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
            return IBFSError.eav('L1_FTM_OPEN', null, error as Error)
        }
    }

    /**
     * Appends a new address to the file trace map and allocates new link blocks as needed.
     * Note that this should be done `AFTER` the related data blocks have been written to in order 
     * to prevent null pointers. These addresses do not have to be appended after every new block 
     * is written, but MUST saved be before the file is closed in order to retain changes.
     * @param address 
     */
    public async append(addresses: number | number[]): T.XEavSA<"L1_FTM_APPEND"> {
        try {
            

        } 
        catch (error) {
            return new IBFSError('L1_FTM_APPEND', null, error as Error)    
        }
    }

    /**
     * Pops `N` addresses from the file allocation list and reclaims any leftover link blocks for reallocation.  
     * Note that this should be done `BEFORE` the related data blocks are deleted in order to prevent null pointers.
     * @param count 
     */
    public async pop(count: number): T.XEavA<number[], "L1_FTM_POP"> {
        try {
        
            const popped: number[] = []
            

            return [null, popped]

        } 
        catch (error) {
            return IBFSError.eav('L1_FTM_POP', null, error as Error)
        }
    }

}