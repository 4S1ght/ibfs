// Imports ========================================================================================

import * as T from '../../types.js'

import * as C from '../Constants.js'
import Memory from './Memory.js'
import BlockAESContext, { TAesCipher, TAesConfig } from './BlockAES.js'
import IBFSError from '../errors/IBFSError.js'

// Types ==========================================================================================

export interface TBlockSerializeConfig {
    /** Physical size of individual blocks - Aka. 1024, 2048, 4096, etc... */
    physicalBlockSize: number
    
}

// Root block =====================================================================================

export interface TRootBlock {
    /** Specification version (major)                   */ specMajor:     number
    /** Specification version (minor)                   */ specMinor:     number
    /** Root block address                              */ root:          number
    /** AES cipher used                                 */ aesCipher:     TAesCipher
    /** AES initialization vector                       */ aesIV:         Buffer
    /** 0-filled buffer encrypted with the original key */ aesKeyCheck:   Buffer
    /** Compatibility mode                              */ compatibility: boolean
    /** Block size (levels 1-15)                        */ blockSize:     keyof typeof BlockSerializationContext.BLOCK_SIZES
    /** Number of blocks in the volume                  */ blockCount:    number
}

// Exports ========================================================================================

export default class BlockSerializationContext {

    // Constants
    public static readonly HEAD_BLOCK_HEADER_SIZE = 64
    public static readonly LINK_BLOCK_HEADER_SIZE = 32
    public static readonly STORE_BLOCK_HEADER_SIZE = 32

    public static readonly BLOCK_SIZES = { 
        1:  C.KB_1,  2: C.KB_2,  3: C.KB_4,   4: C.KB_8,    5: C.KB_16, 
        6:  C.KB_32, 7: C.KB_64, 8: C.KB_128, 9: C.KB_256, 10: C.KB_512, 
        11: C.MB_1, 12: C.MB_2, 13: C.MB_4,  14: C.MB_8,   15: C.MB_16
    } as const

    // Configuration
    public readonly BLOCK_SIZE: number
    public readonly HEAD_CONTENT_SIZE: number
    public readonly LINK_CONTENT_SIZE: number
    public readonly STORE_CONTENT_SIZE: number

    public readonly aes: BlockAESContext

    constructor(config: TBlockSerializeConfig & TAesConfig) {

        this.BLOCK_SIZE = config.physicalBlockSize
        this.HEAD_CONTENT_SIZE  = this.BLOCK_SIZE - BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
        this.LINK_CONTENT_SIZE  = this.BLOCK_SIZE - BlockSerializationContext.LINK_BLOCK_HEADER_SIZE
        this.STORE_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.STORE_BLOCK_HEADER_SIZE

        this.aes = new BlockAESContext(config)

    }

    // Root Block =============================================================

    /** 
     * Serializes a root block and returns a buffer that can be written to the disk.
     */
    public static serializeRootBlock(blockData: TRootBlock): T.XEav<Buffer, 'L0_BSR_ROOTERR'> {
        try {

            const block = Memory.alloc(BlockSerializationContext.BLOCK_SIZES[blockData.blockSize])

            block.writeInt16(blockData.specMajor)
            block.writeInt16(blockData.specMinor)
            block.writeInt64(blockData.root)
            block.writeInt8({ 'none': 0, 'aes-128-xts': 1, 'aes-256-xts': 2 }[blockData.aesCipher])
            block.write(blockData.aesIV)
            block.write(blockData.aesKeyCheck)
            block.writeInt8(blockData.compatibility ? 1 : 0)
            block.writeInt8(blockData.blockSize)
            block.writeInt64(blockData.blockCount)

            return [null, block.buffer]
            
        } 
        catch (error) {
            return [new IBFSError('L0_BSR_ROOTERR', error, null, blockData), null]
        }
    }

    /** Deserializes a root block and returns its information. */
    public static deserializeRootBlock(blockBuffer: Buffer): T.XEav<TRootBlock, 'L0_BSR_ROOTERR'> {
        try {
            
            const data: Partial<TRootBlock> = {}
            const block = Memory.take(blockBuffer)

            data.specMajor      = block.readInt16()
            data.specMinor      = block.readInt16()
            data.root           = block.readInt64()
            data.aesCipher      = (['none', 'aes-128-xts', 'aes-256-xts'] as const)[block.readInt8()]
            data.aesIV          = block.read(16)
            data.aesKeyCheck    = block.read(16)
            data.compatibility  = block.readInt8() === 1
            data.blockSize      = block.readInt8() as keyof typeof BlockSerializationContext.BLOCK_SIZES
            data.blockCount     = block.readInt64()

            return [null, data as TRootBlock]

        } 
        catch (error) {
            return [new IBFSError('L0_BSR_ROOTERR', error, null, blockBuffer), null]
        }
    }


}