// Imports =============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlockRead, TLinkBlockRead } from '../../L0/Volume.js'

// Types ===============================================================================================================

export interface TFTMOpenOptions {
    /** Reference to the containing filesystem. */ containingFilesystem:                    FilesystemContext
    /** Address of FTM's head block.            */ headAddress:                             number
    /** AES encryption key.                     */ aesKey:                                  Buffer
    /** Enables/disables integrity checks.      */ integrity?:                              boolean
}

type TFTMArray = [
       { block: THeadBlockRead, address: number },
    ...{ block: TLinkBlockRead, address: number }[]
]

// Exports =============================================================================================================

export default class FileTraceMap {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare containingFilesystem:    FilesystemContext
    /** Address of FTM's head block.            */ private declare startingAddress:         number
    /** AES encryption key.                     */ private declare aesKey:                  Buffer

    // State -----------------------------------------------------------------------------------------------------------

    /** 
     * Stores the deserialized index blocks belonging to the trace map.  
     * First position always stores the head block which is then followed by `N` link blocks.
     */
    private declare items: TFTMArray

    /** This value is true whenever an unrecoverable write error has occurred in the file trace map. */
    public error: IBFSError | undefined

    // Factory ---------------------------------------------------------------------------------------------------------

    public static async open(options: TFTMOpenOptions): T.XEavA<FileTraceMap, "L1_FTM_OPEN"|"L1_FTM_OPEN_CIRC"> {
        try {

            const self = new this()

            self.containingFilesystem   = options.containingFilesystem
            self.startingAddress        = options.headAddress
            self.aesKey                 = options.aesKey

            // Load head block ----------------------------

            const [headError, head] = await self.containingFilesystem.volume.readHeadBlock(self.startingAddress, self.aesKey, options.integrity)
            if (headError) return IBFSError.eav('L1_FTM_OPEN', null, headError, ssc(options, ['aesKey']))
            
            self.items = [{ 
                block: head, 
                address: self.startingAddress 
            }]

            // Load link blocks  -------------------------

            const visited = new Set<number>()
            let currentAddress = self.items[0].block.next

            while (currentAddress !== 0) {

                // Guards against infinite loops caused by potential circular pointers.
                if (visited.has(currentAddress)) return IBFSError.eav(
                    'L1_FTM_OPEN_CIRC', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: currentAddress }
                )

                const [linkError, link] = await self.containingFilesystem.volume.readLinkBlock(currentAddress, self.aesKey, options.integrity)
                if (linkError) {
                    return IBFSError.eav(
                        'L1_FTM_OPEN',
                        'open() scan failed due to link read error. ',
                        linkError,
                        { blockAddress: currentAddress }
                    )
                }

                self.items.push({
                    block: link,
                    address: currentAddress
                })
                visited.add(currentAddress)
                currentAddress = link.next

            }

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FTM_OPEN', null, error as Error)
        }
    }


}