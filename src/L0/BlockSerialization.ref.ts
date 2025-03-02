// Imports =============================================================================================================

// Utils
import type * as T from "../../types.js"
import Enum from "../misc/enum.js"
import IBFSError from "../errors/IBFSError.js"

// Constants
import * as C from "../Constants.js"

// Serialization & memory
import Memory from "./Memory.js"
import BlockAESContext, { TAESCipher, TAESConfig } from "./BlockAES.js"

// Types ===============================================================================================================

export interface TBlockSerializeConfig {
    blockSize: keyof typeof BlockSerializationContext.BLOCK_SIZES
}

// Blocks --------------------------------------------------------------------------------------------------------------

export interface TRootBlock {
    /** Specification version (major)                    */ specMajor:      number
    /** Specification version (minor)                    */ specMinor:      number
    /** Root block address                               */ root:           number
    /** AES cipher used                                  */ aesCipher:      TAESCipher
    /** AES initialization vector                        */ aesIV:          Buffer
    /** 0-filled buffer encrypted with the original key  */ aesKeyCheck:    Buffer
    /** Crypto tweak emulation compatibility mode        */ compatibility:  boolean
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
    /** Number of blocks in the volume                   */ blockCount:     number
}

export interface TMetaCluster {
    /** JSON-formatted volume metadata                   */ metadata:       { [scope: string]: Record<string, number|string|boolean|null> }
}

export interface THeadBlock {
    /** Timestamp when the block was created             */ created:        number
    /** Timestamp when the block was last modified       */ modified:       number
    /** Resource type (used for recovery)                */ resourceType:   'FILE' | 'DIR'
    /** Next block address (0: final block)              */ next:           number
    /** Block body data                                  */ data:           Buffer
}

// Block I/O metadata --------------------------------------------------------------------------------------------------

export interface TMetadataWriteMeta {
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
}

export interface TCommonWriteMeta {
    /** AES encryption key                               */ aesKey:         Buffer
    /** address of the block (used for XTS encryption)   */ address:        number
}


// Exports =============================================================================================================

export default class BlockSerializationContext {

    // Constants ----------------------------------------------------

    public static readonly HEAD_BLOCK_HEADER_SIZE = 64
    public static readonly LINK_BLOCK_HEADER_SIZE = 32
    public static readonly DATA_BLOCK_HEADER_SIZE = 32

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

    // Dynamic Variables --------------------------------------------

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

    // Root block =============================================================

    /** 
     * Serializes a root block and returns a buffer that can be written to the disk.
     * 
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 2B   | Int16  | Spec major
        2     | 2B   | Int16  | Spec minor
        4     | 8B   | Int64  | Root directory block address
        12    | 1B   | Int8   | AES cipher used (0: none, 1: 128Bit, 2: 256Bit)
        13    | 16B  | Buffer | AES IV
        29    | 16B  | Buffer | AES key check
        45    | 1B   | Int8   | Compatibility mode (0: off, 1: on)
        46    | 1B   | Int8   | Block size
        47    | 8B   | Int64  | Block count
     */
    public static serializeRootBlock(blockData: TRootBlock): T.XEav<Buffer, 'L0_SR_ROOT'> {
        try {

            const block = Memory.alloc(BlockSerializationContext.BLOCK_SIZES[blockData.blockSize])

            block.writeInt16(blockData.specMajor)
            block.writeInt16(blockData.specMinor)
            block.writeInt64(blockData.root)
            block.writeInt8({ 'none': 0, 'aes-128-xts': 1, 'aes-256-xts': 2 }[blockData.aesCipher])
            block.write(blockData.aesIV)
            block.write(blockData.aesKeyCheck)
            block.writeBool(blockData.compatibility)
            block.writeInt8(blockData.blockSize)
            block.writeInt64(blockData.blockCount)

            return [null, block.buffer]

        } 
        catch (error) {
            return IBFSError.eav('L0_SR_ROOT', null, error as Error, blockData)
        }
    }

    /** 
     * Deserializes a root block and returns its information.
     */
    public static deserializeRootBlock(blockBuffer: Buffer): T.XEav<TRootBlock, 'L0_DS_ROOT'> {
        try {

            const data: Partial<TRootBlock> = {}
            const block = Memory.wrap(blockBuffer)

            data.specMajor      = block.readInt16()
            data.specMinor      = block.readInt16()
            data.root           = block.readInt64()
            data.aesCipher      = (['none', 'aes-128-xts', 'aes-256-xts'] as const)[block.readInt8()]
            data.aesIV          = block.read(16)
            data.aesKeyCheck    = block.read(16)
            data.compatibility  = block.readBool()
            data.blockSize      = block.readInt8() as keyof typeof BlockSerializationContext.BLOCK_SIZES
            data.blockCount     = block.readInt64()

            return [null, data as TRootBlock]

        } 
        catch (error) {
            return IBFSError.eav('L0_DS_ROOT', null, error as Error, blockBuffer)
        }
    }

    // Metadata cluster -------------------------------------------------------

    /**
     * Serialized the metadata cluster and returns a buffer that can be written to the disk.  
     * The size is calculated based on the `blockSize * ceil(64kiB / blockSize)` formula
     * in order to ensure the entire cluster can hold at least 64kiB of arbitrary JSON data.
     * 
     * The entire cluster is dedicated to plaintext JSON data.
     * The end of the usable content is marked with the first null byte.
     */
    public static serializeMetaCluster(blockData: TMetaCluster & TMetadataWriteMeta): T.XEav<Buffer, 'L0_SR_META'> {
        try {

            const blockSize = BlockSerializationContext.BLOCK_SIZES[blockData.blockSize]
            const clusterSize = blockSize * Math.ceil(C.KB_64 / blockSize)
            const cluster = Memory.alloc(clusterSize)
            const text = JSON.stringify(blockData.metadata)
            cluster.writeString(text)

            return [null, cluster.buffer]
            
        } 
        catch (error) {
            return IBFSError.eav('L0_SR_META', null, error as Error, blockData)
        }
    }

    /**
     * Deserializes the metadata cluster and returns its information.
     */
    public static deserializeMetaCluster(blockBuffer: Buffer): T.XEav<TMetaCluster['metadata'], 'L0_DS_META'> {
        try {
            
            const firstNullByte = blockBuffer.indexOf(0)
            const textEnd = firstNullByte !== -1 ? firstNullByte : blockBuffer.length - 1
            const metadata = JSON.parse(blockBuffer.toString('utf-8', 0, textEnd))

            return [null, metadata]

        } 
        catch (error) {
            return IBFSError.eav('L0_DS_META', null, error as Error, blockBuffer)
        }
    }

    // Head block -------------------------------------------------------------

    /**
     * Serializes a head block and returns a buffer that can be written to the disk.
     * 
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 1B   | Int8   | Block type (HEAD)
        1     | 4B   | Int32  | CRC checksum
        5     | 8B   | Int64  | Next block address
        13    | 8B   | Int64  | Creation date (Unix timestamp - seconds)
        21    | 8B   | Int64  | Modification date (Unix timestamp - seconds)
        25    | 4B   | Int32  | Size of usable block data
        26    | 1B   | Int8   | Resource type
        27-64 | ---- | ------ | ------------------ Reserved -------------------
        64    | N    | Body   | Block body

     */
    public serializeHeadBlock(blockData: THeadBlock & TCommonWriteMeta) {}




}