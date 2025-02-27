// Imports =============================================================================================================

import type * as T from '../../types.js'
import * as C from '../Constants.js'

import Enum from '../misc/enum.js'
import BlockAESContext, { TAESConfig } from './BlockAES.js'
import IBFSError from '../errors/IBFSError.js'

import RootBlock, { TRootBlock } from './blocks/RootBlock.js'

// Types ===============================================================================================================

export interface TBlockSerializeConfig {
    blockSize: keyof typeof BlockSerializationContext.BLOCK_SIZES
}

// Exports =============================================================================================================

export default class BlockSerializationContext {

    // Constants
    public static readonly HEAD_BLOCK_HEADER_SIZE = 64
    public static readonly DATA_BLOCK_HEADER_SIZE = 32
    public static readonly LINK_BLOCK_HEADER_SIZE = 32

    public static readonly BLOCK_SIZES = { 
        1:  C.KB_1,  2: C.KB_2,  3: C.KB_4,   4: C.KB_8,    5: C.KB_16, 
        6:  C.KB_32, 7: C.KB_64, 8: C.KB_128, 9: C.KB_256, 10: C.KB_512, 
        11: C.MB_1, 12: C.MB_2, 13: C.MB_4,  14: C.MB_8,   15: C.MB_16
    } as const

    public static readonly BLOCK_TYPES = Enum({
        HEAD: 1,
        LINK: 2,
        DATA: 3
    } as const)

    public static readonly RESOURCE_TYPES = Enum({
        FILE: 1,
        DIR:  2
    } as const)

    // Configuration
    public readonly BLOCK_SIZE: number
    public readonly HEAD_CONTENT_SIZE: number
    public readonly LINK_CONTENT_SIZE: number
    public readonly DATA_CONTENT_SIZE: number

    public readonly HEAD_ADDRESS_SPACE: number
    public readonly LINK_ADDRESS_SPACE: number

    public readonly aes: BlockAESContext


    constructor(config: TBlockSerializeConfig & TAESConfig) {
        
        this.BLOCK_SIZE = BlockSerializationContext.BLOCK_SIZES[config.blockSize]

        this.HEAD_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
        this.LINK_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.LINK_BLOCK_HEADER_SIZE
        this.DATA_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.DATA_BLOCK_HEADER_SIZE

        this.HEAD_ADDRESS_SPACE = this.HEAD_CONTENT_SIZE / 8
        this.LINK_ADDRESS_SPACE = this.LINK_CONTENT_SIZE / 8

        this.aes = new BlockAESContext(config)

    }

    // Root Block =============================================================

    /**
     * Creates a new root block instance and populates it, after which
     * it can be written to the disk.
     */
    public static createRootBlock(blockData: TRootBlock): T.XEav<RootBlock, 'L0_SR_ROOT'> {
        try {

            const block = RootBlock.alloc(this.BLOCK_SIZES[blockData.blockSize])

            block.specMajor     = blockData.specMajor
            block.specMinor     = blockData.specMinor
            block.rootAddress   = blockData.rootAddress
            block.aesCipher     = blockData.aesCipher
            block.aesIV         = blockData.aesIV
            block.aesKeyCheck   = blockData.aesKeyCheck
            block.compatibility = blockData.compatibility
            block.blockSize     = blockData.blockSize
            block.blockCount    = blockData.blockCount

            return [null, block]
            
        } 
        catch (error) {
            return IBFSError.eav('L0_SR_ROOT', null, error as Error)
        }
    }

    /**
     * Creates a view into a root block that's been read from the disk.
     */
    public static createRootBlockView(blockBuffer: Buffer): T.XEav<TRootBlock, 'L0_DS_ROOT'> {
        try {
            const block = RootBlock.wrap(blockBuffer)
            return [null, block]
        } 
        catch (error) {
            return IBFSError.eav('L0_DS_ROOT', null, error as Error)
        }
    }
    


}