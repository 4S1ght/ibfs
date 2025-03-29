// Imports =============================================================================================================

import type * as T                  from '../../../types.js'
import ssc                          from '../../misc/safeShallowCopy.js'

import IBFSError                    from '../../errors/IBFSError.js'
import FilesystemContext            from '../Filesystem.js'
import { THeadBlockRead, TLinkBlockRead } from '../../L0/Volume.js'

// Types ===============================================================================================================

export interface TFBMOpenOptions {
    /** Reference to the containing filesystem. */ containingFilesystem:                    FilesystemContext
    /** Address of FBM's head block.            */ headAddress:                             number
    /** AES encryption key.                     */ aesKey:                                  Buffer
    /** Enables/disables integrity checks.      */ integrity?:                              boolean
}

interface TIndexBlockStore<Block> {
    /** Stores the block reference.             */ block:                                   Block
    /** Address of the stored block.            */ address:                                 number
}

type TFBMArray = [
       TIndexBlockStore<THeadBlockRead>,
    ...TIndexBlockStore<TLinkBlockRead>[]
]

// Exports =============================================================================================================

export default class FileBlockMap {

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the containing filesystem. */ private declare containingFilesystem:    FilesystemContext
    /** Address of FBM's head block.            */ private declare startingAddress:         number
    /** AES encryption key.                     */ private declare aesKey:                  Buffer

    // State -----------------------------------------------------------------------------------------------------------

    /** 
     * Stores the deserialized index blocks belonging to the trace map.  
     * First position always stores the head block which is then followed by `N` link blocks.
     */
    private declare items: TFBMArray

    /** This value is true whenever an unrecoverable write error has occurred in the file trace map. */
    public error: IBFSError | undefined

    // Factory ---------------------------------------------------------------------------------------------------------

    /**
     * Opens the file block map.
     * A FBM must only be opened on an already initialized file, meaning there has to be a starting head
     * block already in existence. This design choice is there to ensure no FBM is loaded from a hanging
     * pointer or leftover link blocks that may have been left after soft file deletions.
     */
    public static async open(options: TFBMOpenOptions): T.XEavA<FileBlockMap, "L1_FBM_OPEN"|"L1_FBM_OPEN_CIRC"> {
        try {

            const self = new this()

            self.containingFilesystem   = options.containingFilesystem
            self.startingAddress        = options.headAddress
            self.aesKey                 = options.aesKey

            // Load head block ----------------------------

            const [headError, head] = await self.containingFilesystem.volume.readHeadBlock(self.startingAddress, self.aesKey, options.integrity)
            if (headError) return IBFSError.eav('L1_FBM_OPEN', null, headError, ssc(options, ['aesKey']))
            
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
                    'L1_FBM_OPEN_CIRC', 'Circular address detected.', 
                    null, { addressesVisited: visited, circularAddress: currentAddress }
                )

                const [linkError, link] = await self.containingFilesystem.volume.readLinkBlock(currentAddress, self.aesKey, options.integrity)
                if (linkError) {
                    return IBFSError.eav(
                        'L1_FBM_OPEN',
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
            return IBFSError.eav('L1_FBM_OPEN', null, error as Error)
        }
    }

    // Allocation ------------------------------------------------------------------------------------------------------

    public async append(addresses: number[], iteration = 0): T.XEavSA<"L1_FBM_APPEND"> {
        try {

            const startingBlock = this.items.at(-1)!

            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i]!

                // Append address if there's space for it
                if (startingBlock.block.isFull === false) {
                    startingBlock.block.append(address)
                }
                // Allocate a new link block and re-call append
                // with the remaining subset of addresses
                else {
                    const growError = await this.grow()
                    if (growError) return new IBFSError('L1_FBM_APPEND', null, growError, { iteration })
                    return await this.append(addresses.slice(i), iteration++)
                }
            }
            
        } 
        catch (error) {
            return new IBFSError('L1_FBM_APPEND', null, error as Error, { iteration })    
        }
    }

    /**
     * Allocates a new link block and incorporates it into the block map.
     * This block is written empty to the disk and the previous one is updated with its address.
     * @returns 
     */
    private async grow(): T.XEavSA<"L1_FBM_GROW"> {
        try {

            const startingBlock = this.items.at(-1)!
            const newBlockAddress = this.containingFilesystem.adSpace.alloc()

            // FIXME: Create the link block in memory to avoid unnecessary read.
            // This requires a standalone block serialization method
            const writeError            = await this.containingFilesystem.volume.writeLinkBlock({ next: 0, data: Buffer.alloc(0), aesKey: this.aesKey, address: newBlockAddress})
            const [readError, newBlock] = await this.containingFilesystem.volume.readLinkBlock(newBlockAddress, this.aesKey)
            
            if (writeError || readError) this.containingFilesystem.adSpace.free(newBlockAddress)
            if (writeError) return new IBFSError('L1_FBM_GROW', null, writeError)
            if (readError)  return new IBFSError('L1_FBM_GROW', null, readError)

            startingBlock.block.next = newBlockAddress

            const updateError = startingBlock.block.blockType === 'HEAD'
                ? await this.containingFilesystem.volume.writeHeadBlock({
                    ...startingBlock.block as THeadBlockRead,
                    aesKey: this.aesKey,
                    address: startingBlock.address
                })
                : await this.containingFilesystem.volume.writeLinkBlock({
                    ...startingBlock.block as TLinkBlockRead,
                    aesKey: this.aesKey,
                    address: startingBlock.address
                })

            if (updateError) {
                // If this ever happens, it means that the FTM has become corrupted.
                this.containingFilesystem.adSpace.free(newBlockAddress)
                this.error = updateError
                return new IBFSError('L1_FBM_GROW', null, updateError)
            }
            
        } 
        catch (error) {
            // Not reclaiming the new block address here is intentional.
            // It's better to leak than overwrite user data - especially as 
            // leaks can be easily mitigated with a forced volume re-scan.
            return new IBFSError('L1_FBM_GROW', null, error as Error)
        }
    }

    // Helpers & Misc --------------------------------------------------------------------------------------------------
    
    public get length() {

        const headSpace = this.containingFilesystem.volume.bs.HEAD_ADDRESS_SPACE
        const linkSpace = this.containingFilesystem.volume.bs.LINK_ADDRESS_SPACE

        if (this.items.length === 1) return this.items[0].block.length
        if (this.items.length === 2) return headSpace + this.items[1]!.block.length

        const fullLinkBlockCount = this.items.length - 2
        return headSpace * linkSpace*fullLinkBlockCount + this.items.at(-1)!.block.length
    
    }

}