// Imports ============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlockRead, TLinkBlockRead } from '../../L0/Volume.js'
import { KB_1 } from '../../Constants.js'

// Types ==============================================================================================================

// Types ==============================================================================================================

export interface TFTMOpenOptions {
    /** Reference to the containing filesystem. */ containingFilesystem:                    FilesystemContext
    /** Address of FTM's head block.            */ headAddress:                             number
    /** AES encryption key.                     */ aesKey:                                  Buffer
    /** Enables/disables integrity checks.      */ integrity?:                              boolean
}

interface TIndexBlock<Block> {
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
    public declare indexBlocks: [TIndexBlock<THeadBlockRead>, ...TIndexBlock<TLinkBlockRead>[]]

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
            self.indexBlocks = [{ block: head, hasUnsavedChanges: false }]

            // Load link blocks  -------------------------

            const visited = new Set<number>()
            let nextAddress = self.indexBlocks[0].block.next
            
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

                self.indexBlocks.push({ block: link, hasUnsavedChanges: false })
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
    public async append(address: number): T.XEavSA<"L1_FTM_APPEND"> {
        try {

            await this.allocateNewIndexIfNecessary()

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

    /**
     * Resolves the physical address of the data block corresponding to the given index.  
     * The index refers to the N'th address stored in the file trace map.  
     * Eg. if the FTM contains two data block addresses, such as `123` and `456`,
     * then index `0` will return `123` and index `1` will return `456` while all subsequent
     * indexes will always return undefined to signify the end of the list.
     * @param index 
     */
    public async get(index: number) {

    }


    /**
     * Allocates a new link block if it's necessary for further FTM appends.
     * 
     */
    private async allocateNewIndexIfNecessary(): T.XEavSA<"L1_FTM_ALLOC"> {
        if (this.shouldAllocateNew()) {

            const newBlockAddress = this.containingFilesystem.adSpace.alloc()

            // FIXME: Avoid unnecessary read in the future by working in memory.
            // (Requires a new standalone serialization context method)
            const writeError        = await this.containingFilesystem.volume.writeLinkBlock({ next: 0, data: Buffer.alloc(0), aesKey: this.aesKey, address: newBlockAddress})
            const [readError, link] = await this.containingFilesystem.volume.readLinkBlock(newBlockAddress, this.aesKey)

            if (writeError || readError) this.containingFilesystem.adSpace.free(newBlockAddress)
            if (writeError) return new IBFSError('L1_FTM_ALLOC', null, writeError, { newBlockAddress })
            if (readError)  return new IBFSError('L1_FTM_ALLOC', null, readError,  { newBlockAddress })
            
            this.indexBlocks[this.indexBlocks.length - 1]!.block.next = newBlockAddress
            this.indexBlocks.push({ block: link, hasUnsavedChanges: false })

        }
    }

    private shouldAllocateNew(): boolean {

        const addressSpace = this.indexBlocks.length === 1
            ? this.containingFilesystem.volume.bs.HEAD_ADDRESS_SPACE
            : this.containingFilesystem.volume.bs.LINK_ADDRESS_SPACE
    
        return this.indexBlocks[this.indexBlocks.length - 1]!.block.length === addressSpace

    }

}