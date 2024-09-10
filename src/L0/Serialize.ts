// Imports ====================================================================

import { crc32 } from "zlib"

import Memory from "@L0/Memory.js"
import BlockAES, { AESCipher, AESKeySize, BlockAESConfig } from "@L0/AES.js"
import IBFSError from "@errors/IBFSError.js"
import { ssc } from "../Helpers.js"

// Types ==========================================================================================

export type SectorSize = typeof Serialize.SECTOR_SIZES[number]

export interface BlockSerializeConfig {
    /** Size of individual sectors in the virtual disk file. */
    diskSectorSize: SectorSize
}

// Root sector ================================================================

export interface RootSector {
    /** The size of individual sectors inside the volume. */
    sectorSize: SectorSize
    /** Specification version (major). */
    specMajor: number
    /** Specification version (minor). */
    specMinor: number
    /** Address of the volume's root directory. */
    rootDirectory: number
    /** The AES/XTS cipher used for volume encryption. */
    aesCipher: AESKeySize
    /** The Initialization Vector (IV) used for encryption. */
    aesIV: Buffer
    /** 
     * Mode of compatibility with native NodeJS crypto APIs. 
     * In compatibility mode, only first 8 bytes of the IV are used 
     * and tweak values for XTS encryption should be emulated.
    */
    nodeCryptoCompatMode: boolean
    /** 16 null bytes encrypted with the original key for key validity checks. */
    aesKeyCheck: Buffer
    /** Number of sectors inside the volume. */
    sectorCount: number
    /** 
     * Number of sectors following the root sector.  
     * `metadataSectors * sectorSize` must amount to `>512kiB`.
     */
    metadataSectors: number
}

// Data sectors ===============================================================

export interface CommonReadMeta {
    /** 
     * Metadata providing information about the sector's type and its role. 
     * Exists purely for identification and potential data recovery tooling.
     */
    blockType: Values<typeof SectorType>
    /** CRC32 checksum of the block's content (after encryption) */
    crc32Sum: number
}

export interface CommonWriteMeta {
    /** AES encryption key for disk encryption. */
    aesKey?: Buffer
    /** Address of the block. */
    address: number
}

export interface CommonMeta {
    /** Sector data. */
    data: Buffer
    /** Address of the next block. */
    next: number
    /** The size of the next block (in sectors). */
    nextRange: number
}

export interface HeadBlock extends CommonMeta {
    /** File created date. */
    created: number
    /** File modified date. */
    modified: number
    /** Size of the block (in sectors). */
    headRange: number
}

export interface LinkBlock extends CommonMeta {}
export interface StorageBlock extends CommonMeta {}

type Finalizer<Data extends CommonMeta & CommonReadMeta, Error extends IBFSError> = {
    /** Block metadata */
    metadata: Omit<Data, 'data'>
    /** 
     * Finalizer function that finishes deserializing the block.
     * It needs to be supplied the trailing data sectors after the
     * head/link/storage descriptor sector to decrypt and process the data.
     */
    final: (rawSectors: Buffer) => Eav<Buffer, Error>
} | {
    error: Error
}

enum SectorType {
    HEAD = 1,
    LINK = 2,
    STORE = 3,
}

// Module =========================================================================================

export default class Serialize {

    // Constants
    public static readonly SECTOR_SIZES = [ 1024, 2048, 4096, 8192, 16384, 32768 ] as const
    public static readonly HEAD_META  = 64
    public static readonly LINK_META  = 32
    public static readonly STORE_META = 32
    public static readonly MDATA_META = 16
    
    // Configuration
    public readonly SECTOR_SIZE:   number
    public readonly HEAD_CONTENT:  number
    public readonly LINK_CONTENT:  number
    public readonly STORE_CONTENT: number

    public readonly AES: BlockAES

    constructor(config: BlockSerializeConfig & BlockAESConfig) {

        this.SECTOR_SIZE   = config.diskSectorSize
        this.HEAD_CONTENT  = config.diskSectorSize - Serialize.HEAD_META
        this.LINK_CONTENT  = config.diskSectorSize - Serialize.LINK_META
        this.STORE_CONTENT = config.diskSectorSize - Serialize.STORE_META

        this.AES = new BlockAES({
            iv: config.iv,
            cipher: config.cipher
        })

    }

    // Root sector ================================================================================

    /**
     * Serializes root sector configuration into a buffer ready to be written to the disk.
     * @param sector Sector data object
     * @returns Sector data buffer
     */
    public static createRootSector(sector: RootSector): Eav<Buffer, IBFSError<'L0_BS_CANT_SERIALIZE_ROOT'>> {
        try {
            
            const data = Memory.alloc(sector.sectorSize)

            data.writeInt16(sector.specMajor)
            data.writeInt16(sector.specMinor)
            data.writeInt32(sector.sectorSize)
            data.writeInt64(sector.sectorCount)
            data.writeInt16(sector.metadataSectors)
            data.writeInt64(sector.rootDirectory)
            data.writeInt16(sector.aesCipher)
            data.write(sector.aesIV)
            data.write(sector.aesKeyCheck)
            data.writeBool(sector.nodeCryptoCompatMode)

            return [null, data.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_SERIALIZE_ROOT', null, error as Error, sector), null]
        }
    }

    /**
     * Deserializes the root sector that's been read from the disk into usable information.
     * @param sector Sector data buffer
     * @returns Sector daa object
     */
    public static readRootSector(sector: Buffer): Eav<RootSector, IBFSError<'L0_BS_CANT_DESERIALIZE_ROOT'>> {
        try {
            
            const props: Partial<RootSector> = {}
            const data = Memory.intake(sector)

            props.specMajor            = data.readInt16()
            props.specMinor            = data.readInt16()
            props.sectorSize           = data.readInt32() as SectorSize
            props.sectorCount          = data.readInt64()
            props.metadataSectors      = data.readInt16()
            props.rootDirectory        = data.readInt64()
            props.aesCipher            = data.readInt16() as AESCipher
            props.aesIV                = data.read(16)
            props.aesKeyCheck          = data.read(16)
            props.nodeCryptoCompatMode = data.readBool()

            return [null, props as RootSector]
        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_DESERIALIZE_ROOT', null, error as Error, { sector }), null]
        }
    }

    // Meta block =================================================================================

    /**
     * Serializes a JSON object and produces a metadata block guaranteed to be at least 
     * 1MiB in size and is ready to be written to the disk.
     * @param block JSON object stored inside the block
     * @returns Buffer
     */
    public createMetaBlock(block: Object): Eav<Buffer, IBFSError<'L0_BS_CANT_SERIALIZE_META'>> {
        try {
        
            const size = this.SECTOR_SIZE * Math.ceil(1024*1024 / this.SECTOR_SIZE)
            const data = Memory.alloc(size)

            const jsonString = Buffer.from(JSON.stringify(block))
            data.writeInt32(jsonString.length)
            data.bytesWritten = Serialize.MDATA_META
            data.write(jsonString)

            return [null, data.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_SERIALIZE_META', null, error as Error, { block }), null]
        }
    }

    /**
     * Deserializes the metadata block into a JSON object.
     * @param block Raw metadata block
     * @returns Metadata object
     */
    public readMetaBlock<Metadata extends Object = Object>(block: Buffer): Eav<Metadata, IBFSError<'L0_BS_CANT_DESERIALIZE_META'>>  {
        try {
            
            const data = Memory.intake(block)

            const size = data.readInt32()
            data.bytesRead = Serialize.MDATA_META
            const jsonString = data.readString(size)

            return [null, JSON.parse(jsonString)]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_DESERIALIZE_META', null, error as Error, { block }), null]
        }
    }

    // Head block =================================================================================

    /**
     * Serializes a head block and produces a block that's ready to be written to the disk.  
     * The size of usable `data` must be determined in advance and match the `blockSize`.
     * @param blockData Block data and metadata
     * @returns Buffer
     */
    public createHeadBlock(block: HeadBlock & CommonWriteMeta): Eav<Buffer, IBFSError<'L0_BS_CANT_SERIALIZE_HEAD'>> {
        try {

            const dist = Memory.alloc(this.SECTOR_SIZE * (block.headRange+1))
            const src = Memory.intake(block.data)

            // Metadata
            dist.writeInt8(SectorType.HEAD)                                 // Block type
            dist.writeInt32(0)                                              // CRC
            dist.writeInt64(block.next)                                     // Next block address
            dist.writeInt8(block.nextRange)                                 // Next block range
            dist.writeInt64(block.created)                                  // Creation date
            dist.writeInt64(block.modified)                                 // Modification date
            dist.writeInt8(block.headRange)                                 // Sectors inside the block
            dist.writeInt16(dist.length - Serialize.HEAD_META - src.length) // End sector padding (unencrypted)
            dist.bytesWritten = Serialize.HEAD_META
            dist.bytesRead = Serialize.HEAD_META

            // Head sector
            src.copyTo(dist, this.HEAD_CONTENT)
            this.AES.encrypt(dist.read(this.HEAD_CONTENT), block.aesKey!, block.address)

            // Raw sectors
            for (let i = 1; i < block.headRange+1; i++) {
                const address = block.address + i
                src.copyTo(dist, this.SECTOR_SIZE)
                this.AES.encrypt(dist.read(this.SECTOR_SIZE), block.aesKey!, address)
            }

            // CRC-32 checksum (after encryption)
            dist.bytesRead = Serialize.HEAD_META
            const crc32Sum = crc32(dist.read(Infinity))
            dist.bytesWritten = 1
            dist.writeInt32(crc32Sum)

            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_SERIALIZE_HEAD', null, error as Error, ssc(block, ['data'])), null]
        }
    }

    /**
     * Deserializes a head sector and returns an object containing that sector's metadata and a `final` method.
     * The metadata lists primarily the amount of sectors following the head sector that belong to the same block. 
     * These must be read from the disk and passed to the `final` method to finish deserialization and return user data.
     * This method is used when a block must be read but its size is not yet known, such as during seeking operations
     * on the index blocks, the size is retrieved from head sector metadata.
     * @param headSector Block's head sector (in raw state)
     * @param blockAddress Address of where the sector was read from
     * @param aesKey Decryption key needed for decryption.
     * @returns Head sector data
     */
    // public readHeadBlock(headSector: Buffer, blockAddress: number, aesKey?: Buffer): Finalizer<HeadBlock & CommonReadMeta, IBFSError<'L0_BS_CANT_DESERIALIZE_HEAD'|'L0_CRCSUM_MISMATCH'>> {
    //     try {

    //         const dist = Memory.alloc(this.SECTOR_SIZE * (headSector))
            

    //     } 
    //     catch (error) {
    //         return [new IBFSError('L0_BS_CANT_DESERIALIZE_HEAD', null, error as Error, { blockAddress }), null]
    //     }
    // }

    /**
     * Instantly deserializes a head block and returns an object containing that block's data and metadata.  
     * Unlike `readHeadBlock`, this method is used when the size of the block is known.
     * @param headBlock Block data
     * @param blockAddress Block's head sector address
     * @param blockRange Number of trail sectors following the head
     * @param aesKey Optional AES decryption key
     * @returns Head block data
     */
    public readHeadBlockInstant(headBlock: Buffer, blockAddress: number, blockRange: number, aesKey?: Buffer): Eav<HeadBlock & CommonReadMeta, IBFSError<'L0_BS_CANT_DESERIALIZE_HEAD'|'L0_CRCSUM_MISMATCH'>> {
        try {
            


        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_DESERIALIZE_HEAD', null, error as Error, { blockAddress }), null]
        }
    }

    public createLinkBlock(block: LinkBlock) {}
    public readLinkBlock(block: LinkBlock) {}

    public createStorageBlock(block: StorageBlock) {}
    public readStorageBlock(block: StorageBlock) {}

}