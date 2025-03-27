// Imports =============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlockRead, TLinkBlockRead } from '../../L0/Volume.js'

// Types ===============================================================================================================

// Types ===============================================================================================================

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

// Exports =============================================================================================================

export default class FileTraceMap {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare containingFilesystem:    FilesystemContext
    /** Address of FTM's head block.            */ private declare startingAddress:         number
    /** AES encryption key.                     */ private declare aesKey:                  Buffer

    // State -----------------------------------------------------------------------------------------------------------

    /** This value is true whenever an unrecoverable write error has occurred in the file trace map. */
    public error: IBFSError | undefined

    // Factory ---------------------------------------------------------------------------------------------------------

    /** 
     * Stores the deserialized index blocks belonging to the trace map.  
     * First position always stores the head block which is then followed by `N` link blocks.
     * 
     * TODO: Refactor the list to store block addresses alongside the blocks.
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

    // Allocation ------------------------------------------------------------------------------------------------------

    /**
     * Appends an address to the end of the file trace map and allocates new link blocks
     * as needed. The `addresses` are processed, split across respective index blocks and
     * immediately written to the disk after each `append` call. This is an I/O intensive
     * operation and should be batched to limit unnecessary disk IO and slowdowns.
     * @param address 
     */
    public async append(addresses: number[], iteration = 0): T.XEavSA<"L1_FTM_APPEND"> {
        try {

            const startingBlock = this._lastBlock()

            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i]!

                // Append address if there's space for it
                if (startingBlock.isFull === false) {
                    startingBlock.append(address)
                }
                // Allocate a new link block and re-call append
                // with the remaining subset of addresses
                else {
                    const growError = await this.growIndex()
                    if (growError) return new IBFSError('L1_FTM_APPEND', null, growError, { iteration })
                    return await this.append(addresses.slice(i), iteration++)
                }

            }

        } 
        catch (error) {
            return new IBFSError('L1_FTM_APPEND', null, error as Error, { iteration })    
        }
    }

    /**
     * Allocates a new link block and links the previous block to it.
     */
    private async growIndex(): T.XEavSA<'L1_FTM_LINK_GROW'> {
        try {

            const startingBlock         = this._lastBlock()
            const newBlockAddress       = this.containingFilesystem.adSpace.alloc()

            // FIXME: Create the link block in memory to avoid unnecessary read.
            // This requires a standalone block serialization method
            const writeError            = await this.containingFilesystem.volume.writeLinkBlock({ next: 0, data: Buffer.alloc(0), aesKey: this.aesKey, address: newBlockAddress})
            const [readError, newBlock] = await this.containingFilesystem.volume.readLinkBlock(newBlockAddress, this.aesKey)
            
            if (writeError || readError) this.containingFilesystem.adSpace.free(newBlockAddress)
            if (writeError) return new IBFSError('L1_FTM_LINK_GROW', null, writeError)
            if (readError)  return new IBFSError('L1_FTM_LINK_GROW', null, readError)

            startingBlock.next = newBlockAddress

            const updateError = startingBlock.blockType === 'HEAD'
                ? await this.containingFilesystem.volume.writeHeadBlock({
                    ...startingBlock as THeadBlockRead,
                    aesKey: this.aesKey,
                    address: this.startingAddress
                })
                : await this.containingFilesystem.volume.writeLinkBlock({
                    ...startingBlock as TLinkBlockRead,
                    aesKey: this.aesKey,
                    address: this._secondLastBlock()!.next
                })
                
            if (updateError) {
                // If this ever happens, it means a part of an existing FTM got corrupted.
                this.containingFilesystem.adSpace.free(newBlockAddress)
                this.error = updateError
                return new IBFSError('L1_FTM_LINK_GROW', null, updateError)
            }
            
            this.indexBlocks.push(newBlock)

        } 
        catch (error) {
            // Not reclaiming the new block address here is intentional.
            // It's better to leak than overwrite user data - especially as 
            // leaks can be easily mitigated with a forced volume re-scan.
            return new IBFSError('L1_FTM_LINK_GROW', null, error as Error)
        }
    } 

    // Deallocation ----------------------------------------------------------------------------------------------------

    public async pop(amount: number, iteration = 0): T.XEavA<number[], 'L1_FTM_POP'|'L1_FTM_POP_OUT_OF_RANGE'> {
        try {

            if (amount > this.length) return IBFSError.eav('L1_FTM_POP_OUT_OF_RANGE', null, null, { amount, iteration })

            const lastBlock = this._lastBlock()
            const addresses: number[] = []

            for (let i = amount; i > 0; i--) {
                if (lastBlock.length > 0) {
                    addresses.push(lastBlock.pop()!)
                }
                else {
                    const shrinkError = await this.shrinkIndex()
                    if (shrinkError) return IBFSError.eav('L1_FTM_POP', null, shrinkError, { iteration })

                    const [popError, popped] = await this.pop(i, iteration++)
                    if (popError) return IBFSError.eav('L1_FTM_POP', null, popError, { iteration })
                    addresses.push(...popped)
                    break
                }
            }

            return [null, addresses]

        } 
        catch (error) {
            return IBFSError.eav('L1_FTM_POP', null, error as Error, { iteration })    
        }
    }

    // Unfinished
    private async shrinkIndex(): T.XEavSA<'L1_FTM_LINK_SHRINK'> {
        try {

            const secondLastBlock = this._secondLastBlock()
            const thirdLastBlock  = this._thirdLastBlock()

            const secondLastBlockAddress = thirdLastBlock ? thirdLastBlock.next : this.indexBlocks[0].next

            // Make sure we're not popping off a HEAD block
            if (this._lastBlock().blockType === 'LINK') {
            }

        }
         catch (error) {
            return new IBFSError('L1_FTM_LINK_SHRINK', null, error as Error)
        }
    }

    // Helpers ---------------------------------------------------------------------------------------------------------

    /** Returns the last block in the FTM */
    private _lastBlock = () => this.indexBlocks[this.indexBlocks.length - 1]!

    /** Returns the second last block in the FTM (if there is any) */
    private _secondLastBlock = () => this.indexBlocks[this.indexBlocks.length - 2]

    /** Returns the third last block in the FTM (if there is any) */
    private _thirdLastBlock = () => this.indexBlocks[this.indexBlocks.length - 3]

    /** The length derived from all the addresses stored inside the index blocks. */
    public get length() {
        const headSpace = this.containingFilesystem.volume.bs.HEAD_ADDRESS_SPACE
        const linkSpace = this.containingFilesystem.volume.bs.LINK_ADDRESS_SPACE
        if (this.indexBlocks.length === 1) return             this._lastBlock().length
        if (this.indexBlocks.length === 2) return headSpace + this._lastBlock().length
        return headSpace + linkSpace * (this.indexBlocks.length-2) + this._lastBlock().length
    }

}