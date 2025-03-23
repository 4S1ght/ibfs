// Imports ============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlockRead, TLinkBlockRead } from '../../L0/Volume.js'

// Types ==============================================================================================================

// Types ==============================================================================================================

export interface TFTMOpenOptions {
    /** Reference to the containing filesystem. */ containingFilesystem:                    FilesystemContext
    /** Address of FTM's head block.            */ headAddress:                             number
    /** AES encryption key.                     */ aesKey:                                  Buffer
    /** Enables/disables integrity checks.      */ integrity?:                              boolean
}

interface TIndexBlockStore<Block> {
    /** Whether block's changes are uncommitted */ hasUnsavedChanges:                       boolean
    /** Stores the block reference.             */ block:                                   Block
}

// Exports ============================================================================================================

export default class FileTraceMap {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare containingFilesystem:    FilesystemContext
    /** Address of FTM's head block.            */ private declare startingAddress:         number
    /** AES encryption key.                     */ private declare aesKey:                  Buffer

    // Factory ---------------------------------------------------------------------------------------------------------

    /** 
     * Stores the deserialized index blocks belonging to the trace map.  
     * First position always stores the head block which is followed by `N` link blocks.
     */ 
    public declare indexBlocks: [THeadBlockRead, ...TLinkBlockRead[]]

    /**
     * Opens the file trace map.
     * A FTM must only be opened on an already initialized file, meaning there has to be a starting head
     * block. This design choice is there to ensure no FTM is loaded with leftover link blocks that
     * may have been left after soft file deletions or due to hanging pointers.
     */
    public static async open(options: TFTMOpenOptions): T.XEavA<FileTraceMap, "L1_FTM_OPEN"|"L1_FTM_OPEN_CIRC"> {
        try {
            
            const self = new this()

            self.containingFilesystem   = options.containingFilesystem
            self.startingAddress        = options.headAddress
            self.aesKey                 = options.aesKey

            // Load head block ----------------------------

            const [headError, head] = await self.containingFilesystem.volume.readHeadBlock(self.startingAddress, self.aesKey, options.integrity)
            if (headError) return IBFSError.eav('L1_FTM_OPEN', null, headError, ssc(options, ['aesKey']))
            self.indexBlocks = [head]

            // Load link blocks  -------------------------

            const visited = new Set<number>()
            let nextAddress = self.indexBlocks[0].next
            
            while (nextAddress !== 0) {

                // Guards against infinite loops caused by potential circular pointers.
                if (visited.has(nextAddress)) return IBFSError.eav(
                    'L1_FTM_OPEN_CIRC', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: nextAddress }
                )

                const [linkError, link] = await self.containingFilesystem.volume.readLinkBlock(nextAddress, self.aesKey, options.integrity)
                if (linkError) {
                    return IBFSError.eav(
                        'L1_FTM_OPEN',
                        'open() scan failed due to link read error. ',
                        linkError,
                        { blockAddress: nextAddress }
                    )
                }

                self.indexBlocks.push(link)
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
     * Appends an address to the end of the file trace map and allocates new link blocks
     * as needed.
     * 
     * Note that this should be done `AFTER` the related data blocks have been written to the disk
     * in order to prevent null pointers. These addresses do not have to be appended after every new block 
     * is written, but MUST saved be before the file is closed in order to retain changes.
     *
     * @param address 
     */
    public async append(addresses: number[]): T.XEavSA<"L1_FTM_APPEND"> {
        try {

            const startingBlock = this._lastBlock()
            let i = 0

            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i]!

                if (startingBlock.isFull === false) {
                    startingBlock.append(address)
                }
                else {
                    // Allocate a new link block
                    const newLinkAddress    = this.containingFilesystem.adSpace.alloc()
                    const writeError        = await this.containingFilesystem.volume.writeLinkBlock({ next: 0, data: Buffer.alloc(0), aesKey: this.aesKey, address: newLinkAddress})
                    const [readError, link] = await this.containingFilesystem.volume.readLinkBlock(newLinkAddress, this.aesKey)

                    if (writeError || readError) this.containingFilesystem.adSpace.free(newLinkAddress)
                    if (writeError) return new IBFSError('L1_FTM_APPEND', null, writeError, { newLinkAddress })
                    if (readError)  return new IBFSError('L1_FTM_APPEND', null, readError,  { newLinkAddress })

                    // Update previous index block
                    startingBlock.next = newLinkAddress
                    const updateError = startingBlock.blockType === 'HEAD'
                        ? await this.containingFilesystem.volume.writeHeadBlock({
                            ...startingBlock as THeadBlockRead,
                            aesKey: this.aesKey,
                            address: this.startingAddress
                        })
                        : await this.containingFilesystem.volume.writeLinkBlock({
                            ...startingBlock as TLinkBlockRead,
                            aesKey: this.aesKey,
                            address: newLinkAddress
                        })

                    if (updateError) return new IBFSError('L1_FTM_APPEND', null, updateError)
                    
                    
                }
                
            }

        } 
        catch (error) {
            return new IBFSError('L1_FTM_APPEND', null, error as Error)    
        }
    }

    // private async $progressIfNeeded(): T.XEavSA<"L1_FTM_ALLOC"> {
    //     try {
    //         if (true) {

    //             // Allocate a new index block ------------------------------------------------------------------------------
    
    //             const newBlockAddress = this.containingFilesystem.adSpace.alloc()
    
    //             // FIXME: Avoid unnecessary read in the future by working in memory.
    //             // (Requires a new standalone serialization context method)
    //             const writeError        = await this.containingFilesystem.volume.writeLinkBlock({ next: 0, data: Buffer.alloc(0), aesKey: this.aesKey, address: newBlockAddress})
    //             const [readError, link] = await this.containingFilesystem.volume.readLinkBlock(newBlockAddress, this.aesKey)
    
    //             if (writeError || readError) this.containingFilesystem.adSpace.free(newBlockAddress)
    //             if (writeError) return new IBFSError('L1_FTM_ALLOC', null, writeError, { newBlockAddress })
    //             if (readError)  return new IBFSError('L1_FTM_ALLOC', null, readError,  { newBlockAddress })
                
    //             // Update previous index block
    //             const previousIndex = this.indexBlocks[this.indexBlocks.length - 1]!
    //             previousIndex.block.next = newBlockAddress
    
    //             // Append new one
    //             this.indexBlocks.push({ block: link, hasUnsavedChanges: false })
    
    //             // Save the state of the previous block --------------------------------------------------------------------
    
    //             if (previousIndex && previousIndex.hasUnsavedChanges) {

    //                 const secondPreviousIndex = this.indexBlocks[this.indexBlocks.length - 2]!
    //                 secondPreviousIndex.block.next = newBlockAddress
    
    //                 const writeError = await this.containingFilesystem.volume.writeLinkBlock({
    //                     address: secondPreviousIndex ? secondPreviousIndex.block.next : this.startingAddress,
    //                     next: newBlockAddress,
    //                     data: previousIndex.block.data,
    //                     aesKey: this.aesKey,
    //                 })
    //                 if (writeError) {
    //                     this.containingFilesystem.adSpace.free(newBlockAddress)
    //                     return new IBFSError('L1_FTM_ALLOC', 'Could not update prepending index block after new index allocation.', writeError, { newBlockAddress })
    //                 }
                    
    //             }
    
    //         }
    //     } 
    //     catch (error) {
    //         return new IBFSError('L1_FTM_ALLOC', null, error as Error)
    //     }
    // }

    // Helpers ---------------------------------------------------------------------------------------------------------

    /** Returns the last block in the FTM */
    private _lastBlock = () => this.indexBlocks[this.indexBlocks.length - 1]!

}