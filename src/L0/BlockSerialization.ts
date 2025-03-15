// Imports =============================================================================================================

import zlib from 'node:zlib'

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
    /** Root block address                               */ fsRoot:         number
    /** AES cipher used                                  */ aesCipher:      TAESCipher
    /** AES initialization vector                        */ aesIV:          Buffer
    /** 0-filled buffer encrypted with the original key  */ aesKeyCheck:    Buffer
    /** Crypto tweak emulation compatibility mode        */ compatibility:  boolean
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
    /** Number of blocks in the volume                   */ blockCount:     number
}

// Metadata blocks -----------------------------------------------------------------------------------------------------

export interface TMetaCluster {
    /** JSON-formatted volume metadata                   */ metadata:       { [scope: string]: Record<string, number|string|boolean|null> }
}
export interface TMetadataWriteMeta {
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
}

// Head blocks ---------------------------------------------------------------------------------------------------------

export interface THeadBlock {
    /** Timestamp when the block was created             */ created:        number
    /** Timestamp when the block was last modified       */ modified:       number
    /** Resource type (used for recovery)                */ resourceType:   'FILE' | 'DIR'
    /** Next block address (0: final block)              */ next:           number
    /** Block body data                                  */ data:           Buffer
}

// Link blocks ---------------------------------------------------------------------------------------------------------

export interface TLinkBlock {
    /** Next block's address (0: final block)            */ next:           number
    /** block body data                                  */ data:           Buffer
}

// Data blocks ---------------------------------------------------------------------------------------------------------

export interface TDataBlock {
    /** Block body data                                  */ data:           Buffer
}
export interface TDataBlockReadMeta {
    /** 
     * Used to append data to the remaining free space in the block.Used to prevent buffer concatenation.
     * @returns `true` if data was successfully appended and `false` if the block is too full to fit it.
     */ 
    append: (data: Buffer) => boolean
    /**
     * Number of bytes stored inside the body.
     */
    length: number
}

// Index block metadata ------------------------------------------------------------------------------------------------

export interface TIndexBlockManage {
    /**
     * Appends an address to the end of the block's internal storage.
     * @returns `true` if address was successfully appended and `false` if the block is full.
     */
    append: (address: number) => boolean
    /** 
     * Pops an address from the end of the block's internal storage.
     * @returns `undefined` if the block is empty.
     */ 
    pop: () => number | undefined
    /** 
     * Gets a specific address by its index.
     */ 
    get: (index: number) => number | undefined
    /**
     * Number of addresses stored inside the body.
     */
    length: number
}

// Common block I/O metadata -------------------------------------------------------------------------------------------

export interface TCommonReadMeta {
    /** Block type                                       */ blockType:      'HEAD' | 'LINK' | 'DATA'
    /** CRC32 checksum read from block header            */ crc32sum:       number
    /** CRC32 checksum computed during deserialization   */ crc32Computed:  number
    /** CRC mismatch                                     */ crc32Mismatch:  boolean
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
            block.writeInt64(blockData.fsRoot)
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
            data.fsRoot         = block.readInt64()
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
        25    | 4B   | Int32  | Number of addresses stored
        26    | 1B   | Int8   | Resource type
        27-63 | ---- | ------ | ------------------ Reserved -------------------
        64    | N    | Body   | Block body

     */
    public serializeHeadBlock(blockData: THeadBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_HEAD'|'L0_SR_HEAD_SEGFAULT'|'L0_SR_HEAD_ADDR_REMAINDER'> {
        try {

            if (blockData.data.length > this.HEAD_CONTENT_SIZE) return IBFSError.eav('L0_SR_HEAD_SEGFAULT', null, null, blockData)
            if (blockData.data.length & 7) return IBFSError.eav('L0_SR_HEAD_ADDR_REMAINDER', null, null, blockData)
            
            const hSize = BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE
            const dist  = Memory.allocUnsafe(this.BLOCK_SIZE)
            const src   = Memory.wrap(blockData.data)

            dist.initialize(0, hSize) // Initialize header section

            dist.writeInt8(BlockSerializationContext.BLOCK_TYPES.HEAD)
            dist.writeInt32(0) // Placeholder
            dist.writeInt64(blockData.next)
            dist.writeInt64(blockData.created || 0)
            dist.writeInt64(blockData.modified || 0)
            dist.writeInt32(blockData.data.length / 8)
            dist.writeInt8(BlockSerializationContext.RESOURCE_TYPES[blockData.resourceType])

            dist.bytesWritten = hSize
            dist.bytesRead    = hSize

            const copied = src.copyTo(dist, this.HEAD_CONTENT_SIZE)
            dist.initialize(hSize + copied, dist.length) // initialize leftover uninitialized memory

            const body = dist.read(this.HEAD_CONTENT_SIZE)
            const crc = zlib.crc32(body)
            this.aes.encrypt(body, blockData.aesKey!, blockData.address)

            dist.writeInt32(crc, 1) // Write CRC checksum

            return [null, dist.buffer]
            

        } 
        catch (error) {
            return IBFSError.eav('L0_SR_HEAD', null, error as Error, blockData)
        }
    }

    /**
     * Deserializes the head block and returns its information, along with methods for
     * directly manipulating the addresses stored internally.
     * @param blockBuffer Source block to deserialize
     * @param blockAddress Address of the block (needed for XTS decryption)
     * @param aesKey XTS decryption key
     */
    public deserializeHeadBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): 
        T.XEav<THeadBlock & TCommonReadMeta & TIndexBlockManage, 'L0_DS_HEAD'|'L0_DS_HEAD_CORRUPT'> {
        try {
            
            const src = Memory.wrap(blockBuffer)
 
            const blockType     = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            const crc32sum      = src.readInt32()
            const next          = src.readInt64()
            const created       = src.readInt64()
            const modified      = src.readInt64()
            let   addresses     = src.readInt32()
            const resourceType  = BlockSerializationContext.RESOURCE_TYPES[src.readInt8() as 1|2]
 
            src.bytesRead       = BlockSerializationContext.HEAD_BLOCK_HEADER_SIZE

            const body          = this.aes.decrypt(src.readRemaining(), aesKey, blockAddress)
            const crc32Computed = zlib.crc32(body)
            const crc32Mismatch = crc32Computed !== crc32sum

            if (addresses > this.HEAD_ADDRESS_SPACE) return IBFSError.eav('L0_DS_HEAD_CORRUPT', null, null, blockBuffer)            

            const block: THeadBlock & TCommonReadMeta & TIndexBlockManage = {
                blockType,
                crc32sum,
                next,
                created,
                modified,
                resourceType,
                crc32Computed,
                crc32Mismatch,
                get data() { 
                    return body.subarray(0, addresses*8) 
                },
                get length() { 
                    return addresses 
                },
                get: (index: number) => {
                    return index < addresses 
                        ? Number(body.readBigUint64LE(index*8))
                        : undefined
                },
                append: (address: number): boolean => {
                    if (addresses < this.HEAD_ADDRESS_SPACE) {
                        body.writeBigUint64LE(BigInt(address), addresses*8)
                        src.writeInt32(addresses, 25)
                        addresses++
                        return true
                    }
                    return false
                },
                pop: () => {
                    if (addresses > 0) {
                        addresses--
                        src.writeInt32(addresses, 25)
                        return Number(body.readBigUint64LE(addresses*8))
                    }
                }
            }

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_DS_HEAD', null, error as Error, blockBuffer)    
        }
    }

    // Link block -------------------------------------------------------------

    /**
     * Serializes a link block and returns a buffer that can be written to the disk.
     *
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 1B   | Int8   | Block type (LINK)
        1     | 4B   | Int32  | CRC checksum
        5     | 8B   | Int64  | Next block address
        13    | 4B   | Int32  | Number of addresses stored
        17-31 | ---- | ------ | ------------------ Reserved -------------------
        32    | N    | Body   | Block body

     */
    public serializeLinkBlock(blockData: TLinkBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_LINK'|'L0_SR_LINK_SEGFAULT'|'L0_SR_LINK_ADDR_REMAINDER'> {
        try {

            if (blockData.data.length > this.LINK_CONTENT_SIZE) return IBFSError.eav('L0_SR_LINK_SEGFAULT', null, null, blockData)
            if (blockData.data.length & 7) return IBFSError.eav('L0_SR_LINK_ADDR_REMAINDER', null, null, blockData)

            const hSize = BlockSerializationContext.LINK_BLOCK_HEADER_SIZE
            const dist  = Memory.allocUnsafe(this.BLOCK_SIZE)
            const src   = Memory.wrap(blockData.data)

            dist.initialize(0, hSize)

            dist.writeInt8(BlockSerializationContext.BLOCK_TYPES.LINK)
            dist.writeInt32(0) // Placeholder
            dist.writeInt64(blockData.next)
            dist.writeInt32(blockData.data.length / 8)

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
            return IBFSError.eav('L0_SR_LINK', null, error as Error, blockData)
        }
    }

    /**
     * Deserializes the link block and returns its information, along with methods for
     * directly manipulating the addresses stored internally.
     * @param blockBuffer Source block to deserialize
     * @param blockAddress Address of the block (needed for XTS decryption)
     * @param aesKey XTS decryption key
     */
    public deserializeLinkBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): 
        T.XEav<TLinkBlock & TCommonReadMeta & TIndexBlockManage, 'L0_DS_LINK'|'L0_DS_LINK_CORRUPT'> {
        try {

            const src = Memory.wrap(blockBuffer)

            const blockType     = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            const crc32sum      = src.readInt32()
            const next          = src.readInt64()
            let   addresses     = src.readInt32()

            src.bytesRead       = BlockSerializationContext.LINK_BLOCK_HEADER_SIZE

            const body          = this.aes.decrypt(src.readRemaining(), aesKey, blockAddress)
            const crc32Computed = zlib.crc32(body)
            const crc32Mismatch = crc32Computed !== crc32sum

            if (addresses > this.LINK_ADDRESS_SPACE) return IBFSError.eav('L0_DS_LINK_CORRUPT', null, null, blockBuffer)            

            const block: TLinkBlock & TCommonReadMeta & TIndexBlockManage = {
                blockType,
                crc32sum,
                next,
                crc32Computed,
                crc32Mismatch,
                get data() { 
                    return body.subarray(0, addresses*8) 
                },
                get length() {
                    return addresses
                },
                get: (index: number) => {
                    return index < addresses 
                        ? Number(body.readBigUint64LE(index*8))
                        : undefined
                },
                append: (address: number): boolean => {
                    if (addresses < this.LINK_ADDRESS_SPACE) {
                        body.writeBigUint64LE(BigInt(address), addresses*8)
                        src.writeInt32(addresses, 25)
                        addresses++
                        return true
                    }
                    return false
                },
                pop: () => {
                    if (addresses > 0) {
                        addresses--
                        src.writeInt32(addresses, 25)
                        return Number(body.readBigUint64LE(addresses*8))
                    }
                }
            }

            return [null, block]

        }
        catch (error) {
            return IBFSError.eav('L0_DS_LINK', null, error as Error, blockBuffer)
        }
    }

    // Data block -------------------------------------------------------------


    /**
     * Serializes a link block and returns a buffer that can be written to the disk.
     *
        Index | Size | Type   | Description
        ------|------|--------|------------------------------------------------
        0     | 1B   | Int8   | Block type (LINK)
        1     | 4B   | Int32  | CRC checksum
        5     | 8B   | Int64  | Next block address
        13    | 4B   | Int32  | Size of usable block data
        17-31 | ---- | ------ | ------------------ Reserved -------------------
        32    | N    | Body   | Block body
     */
    public serializeDataBlock(blockData: TDataBlock & TCommonWriteMeta): T.XEav<Buffer, 'L0_SR_DATA'|'L0_SR_LINK_SEGFAULT'> {
        try {

            if (blockData.data.length > this.DATA_CONTENT_SIZE) return IBFSError.eav('L0_SR_LINK_SEGFAULT', null, null, blockData)

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
            return IBFSError.eav('L0_SR_DATA', null, error as Error, blockData)
        }        
    }

    /**
     * Deserializes the data block and returns ints information.
     * @param blockBuffer 
     * @param blockAddress 
     * @param aesKey 
     */
    public deserializeDataBlock(blockBuffer: Buffer, blockAddress: number, aesKey: Buffer): 
        T.XEav<TDataBlock & TDataBlockReadMeta & TCommonReadMeta, 'L0_DS_DATA'> {
        try {

            const self = this
            const src = Memory.wrap(blockBuffer)

            const blockType = BlockSerializationContext.BLOCK_TYPES[src.readInt8() as 1|2|3]
            const crc32sum  = src.readInt32()
            let   bodySize  = src.readInt32()

            src.bytesRead = BlockSerializationContext.DATA_BLOCK_HEADER_SIZE

            const body = this.aes.decrypt(src.readRemaining(), aesKey, blockAddress)
            const crc32Computed = zlib.crc32(body)
            const crc32Mismatch = crc32Computed !== crc32sum

            const block: TDataBlock & TDataBlockReadMeta & TCommonReadMeta = {
                blockType,
                crc32sum,
                crc32Computed,
                crc32Mismatch,
                get data() { 
                    return body.subarray(0, bodySize) 
                },
                set data(value) {
                    if (value.length > self.DATA_CONTENT_SIZE) throw new RangeError('Data too large')
                    bodySize = value.length
                    value.copy(body, 0)
                    body.fill(0, bodySize, body.length-1)
                },
                get length() { 
                    return bodySize 
                },
                append: (data: Buffer) => {
                    if (bodySize + data.length > this.DATA_CONTENT_SIZE) return false
                    bodySize += data.copy(body, bodySize)
                    return true
                }
            }

            return [null, block]

        }
        catch (error) {
            return IBFSError.eav('L0_DS_DATA', null, error as Error, blockBuffer)
        }
    }

}
