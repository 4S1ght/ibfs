// Imports ====================================================================

import { crc32 } from "zlib"

import Memory from "@L0/Memory.js"
import BlockAES, { AESCipher, AESKeySize, BlockAESConfig } from "@L0/AES.js"
import IBFSError from "@errors/IBFSError.js"

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
    /** Address of the next link block. */
    next: number
    /** Number of sectors within the block (excluding the head block). */
    blockRange: number
}

export interface HeadBlock extends CommonMeta {
    /** File created date. */
    created: number
    /** File modified date. */
    modified: number
}

export interface LinkBlock extends CommonMeta {}
export interface StorageBlock extends CommonMeta {}

interface Finalizer<Data> {
    /** Block metadata */
    metadata: Omit<Data, 'data'>
    /** 
     * Finalizer function that finishes deserializing the block.
     * It needs to be supplied the trailing data sectors after the
     * head/link/storage descriptor sector to decrypt and process the data.
     */
    final: (rawSectors: Buffer) => Data
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
    public static createRootSector(sector: RootSector): Buffer {

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

        return data.buffer

    }

    /**
     * Deserializes the root sector that's been read from the disk into usable information.
     * @param sector Sector data buffer
     * @returns Sector daa object
     */
    public static readRootSector(sector: Buffer): RootSector {

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

        return props as RootSector

    }

    // Meta block =================================================================================

    /**
     * Serializes a JSON object and produces a metadata block guaranteed to be at least 
     * 1MiB in size and is ready to be written to the disk.
     * @param block JSON object stored inside the block
     * @returns Buffer
     */
    public createMetaBlock(block: Object) {

        const size = this.SECTOR_SIZE * Math.ceil(1024*1024 / this.SECTOR_SIZE)
        const data = Memory.alloc(size)

        const jsonString = Buffer.from(JSON.stringify(block))
        data.writeInt32(jsonString.length)
        data.bytesWritten = Serialize.MDATA_META
        data.write(jsonString)

        return data.buffer

    }

    /**
     * Deserializes the metadata block into a JSON object.
     * @param block Raw metadata block
     * @returns Metadata object
     */
    public readMetaBlock<Metadata extends Object = Object>(block: Buffer): Metadata {

        const data = Memory.intake(block)

        const size = data.readInt32()
        data.bytesRead = Serialize.MDATA_META
        const jsonString = data.readString(size)

        return JSON.parse(jsonString)

    }

    // Head block =================================================================================

    public createHeadBlock(blockData: HeadBlock & CommonWriteMeta): Buffer {

        const dist = Memory.alloc(this.SECTOR_SIZE * blockData.blockRange+1)
        const src = Memory.intake(blockData.data)

        // Metadata
        dist.writeInt8(SectorType.HEAD)                                 // Block type
        dist.writeInt32(0)                                              // CRC
        dist.writeInt64(blockData.next)                                 // Next address
        dist.writeInt64(blockData.created)                              // Creation date
        dist.writeInt64(blockData.modified)                             // Modification date
        dist.writeInt8(blockData.blockRange)                            // Sectors inside the block
        dist.writeInt16(dist.length - Serialize.HEAD_META - src.length) // End sector padding (unencrypted)
        dist.bytesWritten = Serialize.HEAD_META

        // Head sector
        src.bytesRead = Serialize.HEAD_META
        const address = blockData.address
        const headSectorData = src.read(this.HEAD_CONTENT)
        const headSectorDataEnc = this.AES.encrypt(headSectorData, blockData.aesKey!, address)
        dist.write(headSectorDataEnc)

        // Raw sectors
        for (let i = 1; i < blockData.blockRange - 1; i++) {
            const address = blockData.address + i
            const sectorData = src.read(this.SECTOR_SIZE)
            const sectorDataEnc = this.AES.encrypt(sectorData, blockData.aesKey!, address)
            dist.write(sectorDataEnc)
        }

        // Final sector (serialized separately due to variable content length)
        src.bytesRead = Serialize.HEAD_META
        const lastAddress = blockData.address + blockData.blockRange
        const lastSectorData = Buffer.alloc(this.SECTOR_SIZE) // Makes sure of proper sector length
        src.read(this.SECTOR_SIZE).copy(lastSectorData)       // and only then reads data
        const lastSectorDataEnc = this.AES.encrypt(lastSectorData, blockData.aesKey!, lastAddress)
        dist.write(lastSectorDataEnc)

        // Read encrypted content...
        dist.bytesRead = Serialize.HEAD_META
        const crc32Sum = crc32(dist.read(Infinity))
        // ...and compute the checksum
        dist.bytesWritten = 1
        dist.writeInt32(crc32Sum)

        return dist.buffer

    }

    public readHeadBlock(headSector: Buffer): Finalizer<HeadBlock & CommonReadMeta> {

        // @ts-expect-error - Populated later
        const props: HeadBlock & CommonReadMeta = {}
        const src = Memory.intake(headSector)

        props.blockType   = src.readInt8()
        props.crc32Sum    = src.readInt32()
        props.next        = src.readInt64()
        props.created     = src.readInt64()
        props.modified    = src.readInt64()
        props.blockRange  = src.readInt8()
        const endPadding  = src.readInt16()

        const dist = Memory.alloc(props.blockRange+1)
        
        return {
            metadata: props,
            final: (sectors: Buffer) => {

                // TODO: parse the content

                props.data = dist.readFilled()
                return props
            }
        }

    }

    public createLinkBlock(block: LinkBlock) {}
    public readLinkBlock(block: LinkBlock) {}

    public createStorageBlock(block: StorageBlock) {}
    public readStorageBlock(block: StorageBlock) {}

}