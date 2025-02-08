// TODOs ==========================================================================================
/**
 
    --- [Maybe] ---

    - Refactor serialization methods to compute CRC's *AFTER* encryption (maybe)
        - Pro: Faster certain types of scans & checks integrity of actual data written to the disk.
        - Con: Doesn't check integrity of decrypted user data and gives more room for ds/rs bugs.

*/
// Imports ========================================================================================

import * as T from '../../types.js'

import * as C from '../Constants.js'
import Memory from './Memory.js'
import BlockAESContext, { TAesCipher, TAesConfig } from './BlockAES.js'
import IBFSError from '../errors/IBFSError.js'
import Enum from '../misc/enum.js'

import ini from 'ini'
import zlib from 'zlib'

// Types ==========================================================================================

export interface TBlockSerializeConfig {
    blockSize: keyof typeof BlockSerializationContext.BLOCK_SIZES
}

// BLocks =========================================================================================

export interface TRootBlock {
    /** Specification version (major)                    */ specMajor:      number
    /** Specification version (minor)                    */ specMinor:      number
    /** Root block address                               */ root:           number
    /** AES cipher used                                  */ aesCipher:      TAesCipher
    /** AES initialization vector                        */ aesIV:          Buffer
    /** 0-filled buffer encrypted with the original key  */ aesKeyCheck:    Buffer
    /** Crypto tweak emulation compatibility mode        */ compatibility:  boolean
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
    /** Number of blocks in the volume                   */ blockCount:     number
}

export interface TMetaCluster {
    /** INI-formatted volume metadata                    */ metadata:       { [key: string]: Record<string, string | boolean> }
}

export interface THeadBlock {
    /** Timestamp when the block was created             */ created:        number
    /** Timestamp when the block was last modified       */ modified:       number
    /** Resource type (used for recovery)                */ resourceType:   'FILE' | 'DIR'
    /** Next block address (0: final block)              */ next:           number
    /** Block body data                                  */ data:           Buffer
}

export interface TLinkBlock {
    /** Next block's address (0: final block)            */ next:           number
    /** block body data                                  */ data:           Buffer
}

export interface TDataBlock {
    /** Block body data                                  */ data:           Buffer
}

// IO Metadata ====================================================================================

export interface TCommonWriteMeta {
    /** AES encryption key                               */ aesKey:         Buffer
    /** address of the block (used for XTS encryption)   */ address:        number
}
export interface TCommonReadMeta {
    /** Block type                                       */ blockType:      'HEAD' | 'LINK' | 'DATA'
    /** CRC32 checksum read from block header            */ crc32sum:       number
    /** CRC32 checksum computed during deserialization   */ crc32Computed:  number
    /** CRC mismatch                                     */ crc32Mismatch:  boolean
}

export interface TMetadataWriteMeta {
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
}

// Exports ========================================================================================

export default class BlockSerializationContext {

    // Constants
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

    // Configuration
    public readonly BLOCK_SIZE: number
    public readonly HEAD_CONTENT_SIZE: number
    public readonly LINK_CONTENT_SIZE: number
    public readonly DATA_CONTENT_SIZE: number

    public readonly aes: BlockAESContext

    constructor(config: TBlockSerializeConfig & TAesConfig) {
        
        this.BLOCK_SIZE = BlockSerializationContext.BLOCK_SIZES[config.blockSize]
        this.HEAD_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
        this.LINK_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.LINK_BLOCK_HEADER_SIZE
        this.DATA_CONTENT_SIZE = this.BLOCK_SIZE - BlockSerializationContext.DATA_BLOCK_HEADER_SIZE

        this.aes = new BlockAESContext(config)

    }

    // Root Block =============================================================

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
    public static serializeRootBlock(blockData: TRootBlock): T.XEav<Buffer, 'L0_SR_ROOTERR'> {
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
            return [new IBFSError('L0_SR_ROOTERR', null, error as Error, blockData), null]
        }
    }

    /** 
     * Deserializes a root block and returns its information.
     */
    public static deserializeRootBlock(blockBuffer: Buffer): T.XEav<TRootBlock, 'L0_DS_ROOTERR'> {
        try {
            
            const data: Partial<TRootBlock> = {}
            const block = Memory.wrap(blockBuffer)

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
            return [new IBFSError('L0_DS_ROOTERR', null, error as Error, blockBuffer), null]
        }
    }

    // Metadata blocks ========================================================

    /**
     * Serialized the metadata cluster and returns a buffer that can be written to the disk.  
     * The size is calculated based on the `blockSize * ceil(64kiB / blockSize)` formula
     * in order to ensure the size of the entire cluster is at minimum equal to 64kiB.
     */
    public static serializeMetaCluster(blockData: TMetaCluster & TMetadataWriteMeta): T.XEav<Buffer, 'L0_SR_METAERR'> {
        try {

            const blockSize = BlockSerializationContext.BLOCK_SIZES[blockData.blockSize]
            const clusterSize = blockSize * Math.ceil(C.KB_64 / blockSize)
            const cluster = Buffer.allocUnsafe(clusterSize).fill(0)
            const text = ini.stringify(blockData.metadata)
            cluster.write(text, 0, 'utf-8')
            
            return [null, cluster]

        } 
        catch (error) {
            return [new IBFSError('L0_SR_METAERR', null, error as Error, blockData), null]
        }
    }

    /**
     * Deserializes the metadata cluster and returns its information.
     */
    public static deserializeMetaCluster(blockBuffer: Buffer): T.XEav<TMetaCluster['metadata'], 'L0_DS_METAERR'> {
        try {
         
            const firstNullByte = blockBuffer.indexOf(0)
            const textEnd = firstNullByte === -1 ? blockBuffer.length - 1 : firstNullByte
            const text = blockBuffer.toString('utf-8', 0, textEnd)
            const metadata = ini.parse(text)

            return [null, metadata]

        }
         catch (error) {
            return [new IBFSError('L0_DS_METAERR', null, error as Error, blockBuffer), null]    
        }
    }

    // Data block =============================================================

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
     */
    public serializeHeadBlock(blockData: THeadBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_HEADERR'> {
        try {
            
            const hSize = BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
            const dist  = Memory.allocUnsafe(this.BLOCK_SIZE)
            const src   = Memory.wrap(blockData.data)

            dist.initialize(0, hSize)

            dist.writeInt8(BlockSerializationContext.BLOCK_TYPES.HEAD)
            dist.writeInt32(0) // Placeholder
            dist.writeInt64(blockData.next)
            dist.writeInt64(blockData.created || 0)
            dist.writeInt64(blockData.modified || 0)
            dist.writeInt32(blockData.data.length)
            dist.writeInt8(BlockSerializationContext.RESOURCE_TYPES[blockData.resourceType])

            dist.bytesWritten = hSize
            dist.bytesRead    = hSize

            const copied = src.copyTo(dist, this.HEAD_CONTENT_SIZE)
            dist.initialize(hSize + copied, dist.length) // 0-fill leftover uninitialized memory

            const body = dist.read(this.HEAD_CONTENT_SIZE)
            const crc = zlib.crc32(body)
            this.aes.encrypt(body, blockData.aesKey!, blockData.address)

            dist.writeInt32(crc, 1) // Content checksum

            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_SR_HEADERR', null, error as Error, blockData), null]    
        }
    }

    /**
     * Deserializes a head block and returns its information.
     */
    public deserializeHeadBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): T.XEav<THeadBlock & TCommonReadMeta, 'L0_DS_HEADERR'> {
        try {
            
            const props: Partial<THeadBlock & TCommonReadMeta> = {}
            const src = Memory.wrap(blockBuffer)

            props.blockType     = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            props.crc32sum      = src.readInt32()
            props.next          = src.readInt64()
            props.created       = src.readInt64()
            props.modified      = src.readInt64()
            const bodySize      = src.readInt32()
            props.resourceType  = BlockSerializationContext.RESOURCE_TYPES[src.readInt8() as 1|2]

            src.bytesRead       = BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
            const body          = this.aes.decrypt(src.readRemaining(), aesKey, blockAddress)
            props.crc32Computed = zlib.crc32(body)
            props.crc32Mismatch = props.crc32Computed !== props.crc32sum
            props.data          = body.subarray(0, bodySize)

            return [null, props as Required<typeof props>]

        } 
        catch (error) {
            return [new IBFSError('L0_DS_HEADERR', null, error as Error, blockBuffer), null]    
        }
    }

    /**
     * Serializes a link block and returns a buffer that can be written to the disk.
     *
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 1B   | Int8   | Block type (LINK)
        1     | 4B   | Int32  | CRC checksum
        5     | 8B   | Int64  | Next block address
        13    | 4B   | Int32  | Size of usable block data
     */
    public serializeLinkBlock(blockData: TLinkBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_LINKERR'> {
        try {

            const hSize = BlockSerializationContext.LINK_BLOCK_HEADER_SIZE
            const dist  = Memory.allocUnsafe(this.BLOCK_SIZE)
            const src   = Memory.wrap(blockData.data)

            dist.initialize(0, hSize)

            dist.writeInt8(BlockSerializationContext.BLOCK_TYPES.LINK)
            dist.writeInt32(0) // Placeholder
            dist.writeInt64(blockData.next)
            dist.writeInt32(blockData.data.length)

            dist.bytesWritten = hSize
            dist.bytesRead    = hSize

            const copied = src.copyTo(dist, this.LINK_CONTENT_SIZE)
            dist.initialize(hSize + copied, dist.length) // 0-fill leftover uninitialized memory

            const body = dist.read(this.LINK_CONTENT_SIZE)
            const crc = zlib.crc32(body)
            this.aes.encrypt(body, blockData.aesKey!, blockData.address)

            dist.writeInt32(crc, 1) // Content checksum

            return [null, dist.buffer]            
            
        } 
        catch (error) {
            return [new IBFSError("L0_SR_LINKERR", null, error as Error, blockData), null]
        }
    }

    /**
     * Deserializes a link block and returns its information.
     */
    public deserializeLinkBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): T.XEav<TLinkBlock & TCommonReadMeta, 'L0_DS_LINKERR'> {
        try {
            
            const props: Partial<TLinkBlock & TCommonReadMeta> = {}
            const src = Memory.wrap(blockBuffer)

            props.blockType     = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            props.crc32sum      = src.readInt32()
            props.next          = src.readInt64()
            const bodySize      = src.readInt32()

            src.bytesRead       = BlockSerializationContext.LINK_BLOCK_HEADER_SIZE

            const body          = this.aes.decrypt(src.readRemaining(), aesKey!, blockAddress)
            props.crc32Computed = zlib.crc32(body)
            props.crc32Mismatch = props.crc32Computed !== props.crc32sum
            props.data          = body.subarray(0, bodySize)

            return [null, props as Required<typeof props>]

        } 
        catch (error) {
            return [new IBFSError("L0_DS_LINKERR", null, error as Error, blockBuffer), null]
        }
    }

    /**
     * Serializes a data block that can be written to the disk.
     * 
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 1B   | Int8   | Block type (DATA)
        1     | 4B   | Int32  | CRC checksum
        5     | 4B   | Int32  | Size of usable block data
     */
    public serializeDataBlock(blockData: TDataBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_DATAERR'> {
        try {

            const hSize = BlockSerializationContext.DATA_BLOCK_HEADER_SIZE
            const dist  = Memory.allocUnsafe(this.BLOCK_SIZE)
            const src   = Memory.wrap(blockData.data)

            dist.initialize(0, hSize)

            dist.writeInt8(BlockSerializationContext.BLOCK_TYPES.DATA)
            dist.writeInt32(0) // Placeholder
            dist.writeInt32(blockData.data.length)

            dist.bytesWritten = hSize
            dist.bytesRead    = hSize

            const copied = src.copyTo(dist, this.DATA_CONTENT_SIZE)
            dist.initialize(hSize + copied, dist.length) // 0-fill leftover uninitialized memory

            const body = dist.read(this.DATA_CONTENT_SIZE)
            const crc = zlib.crc32(body)
            this.aes.encrypt(body, blockData.aesKey, blockData.address)

            dist.writeInt32(crc, 1) // Content checksum

            return [null, dist.buffer]
            
        } 
        catch (error) {
            return [new IBFSError("L0_SR_DATAERR", null, error as Error, blockData), null]
        }
    }

    /**
     * Deserializes a data block and returns its information.
     */
    public deserializeDataBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): T.XEav<TDataBlock & TCommonReadMeta, 'L0_DS_DATAERR'> {
        try {
            
            const props: Partial<TDataBlock & TCommonReadMeta> = {}
            const src = Memory.wrap(blockBuffer)

            props.blockType     = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            props.crc32sum      = src.readInt32()
            const bodySize      = src.readInt32()

            src.bytesRead       = BlockSerializationContext.DATA_BLOCK_HEADER_SIZE

            const body          = this.aes.decrypt(src.readRemaining(), aesKey, blockAddress)
            props.crc32Computed = zlib.crc32(body)
            props.crc32Mismatch = props.crc32Computed !== props.crc32sum
            props.data          = body.subarray(0, bodySize)

            return [null, props as Required<typeof props>]

        } 
        catch (error) {
            return [new IBFSError("L0_DS_DATAERR", null, error as Error, blockBuffer), null]
        }
    }


    // Misc & Helpers ===============================================

    public static getPhysicalBlockSize(blockSize: keyof typeof BlockSerializationContext.BLOCK_SIZES) {
        return BlockSerializationContext.BLOCK_SIZES[blockSize]
    }

    public static getMetaBlockCount(blockSize: keyof typeof BlockSerializationContext.BLOCK_SIZES) {
        return Math.ceil(C.KB_64 / BlockSerializationContext.getPhysicalBlockSize(blockSize))
    }
}

