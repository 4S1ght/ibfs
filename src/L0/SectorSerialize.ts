// Imports ====================================================================

import Memory from './Memory.js'
import type { AESCipher, AESKeySize } from './SectorAES.js'

// Types ======================================================================

export type SectorSize = typeof SectorSerialize.SECTOR_SIZES[number]

// Root sector ================================================================

/** Class initialization config. */
export interface SectorSerializeConfig {
    /** The size of individual sectors inside the volume. */
    sectorSize: SectorSize
}

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
     * NodeJS compatibility mode enabled/disabled. In compat mode, only first 8 bytes of the IV are used.
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

interface CommonReadMeta {
    /** 
     * Metadata providing information about the sector's type and its role. 
     * Exists purely for identification and potential data recovery tooling.
     */
    sectorType: Values<typeof SectorType>
}

interface CommonMeta {
    /** Sector data. */
    data: Buffer
    /** Address of the next link block. */
    next: number
    /** CRC32 checksum of the block's content. */
    crc32Sum: number
    /** Number of sectors within the block (excluding the head block). */
    blockRange: number
}

export interface HeadSector extends CommonMeta {
    /** File created date. */
    created: number
    /** File modified date. */
    modified: number
}

export interface LinkSector extends CommonMeta {}
export interface StorageSector extends CommonMeta {}

enum SectorType {
    HEAD = 1,
    LINK = 2,
    STORE = 3,
}

// Module =====================================================================

export default class SectorSerialize {

    // Constants
    public static readonly SECTOR_SIZES = [ 1024, 2048, 4096, 8192, 16384, 32768 ] as const
    public static readonly HEAD_META  = 64
    public static readonly LINK_META  = 32
    public static readonly STORE_META = 32
    
    // Configuration
    public readonly SECTOR_SIZE:   number
    public readonly HEAD_CONTENT:  number
    public readonly LINK_CONTENT:  number
    public readonly STORE_CONTENT: number

    constructor(config: SectorSerializeConfig) {
        this.SECTOR_SIZE   = config.sectorSize
        this.HEAD_CONTENT  = config.sectorSize - SectorSerialize.HEAD_META
        this.LINK_CONTENT  = config.sectorSize - SectorSerialize.LINK_META
        this.STORE_CONTENT = config.sectorSize - SectorSerialize.STORE_META
    }

    // Root sector ================================================================================

    /**
     * Serializes root sector configuration into a buffer ready to be written to the disk.  
     * -> Refer to root sector documentation in [the specification](../../spec/spec-1.0.md).
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
        data.writeBool(sector.nodeCryptoCompatMode)

        return data.buffer

    }

    /**
     * Deserializes the root sector that's been read from the disk into usable information.  
     * -> Refer to root sector documentation in [the specification](../../spec/spec-1.0.md).
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
        props.nodeCryptoCompatMode = data.readBool()

        return props as RootSector

    }

    // Head sector ================================================================================

    /**
     * Serializes the head sector into a buffer ready to be written to the disk.  
     * -> Refer to head sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data object
     * @returns Sector data buffer
     */
    public createHeadSector(sector: HeadSector): Buffer {

        const data = Memory.alloc(this.SECTOR_SIZE)

        data.writeInt8(SectorType.HEAD)
        data.writeInt32(sector.crc32Sum)
        data.writeInt64(sector.next)
        data.writeInt64(sector.created)
        data.writeInt64(sector.modified)
        data.writeInt8(sector.blockRange)
        data.writeInt16(sector.data.length)
        data.bytesWritten = SectorSerialize.HEAD_META
        data.write(sector.data)

        return data.buffer

    }

    /**
     * Deserializes a head sector that's been read from the disk into usable information.  
     * -> Refer to head sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data buffer
     * @returns Sector data object
     */
    public readHeadSector(sector: Buffer): HeadSector & CommonReadMeta {
        
        const props: Partial<HeadSector & CommonReadMeta> = {}
        const data = Memory.intake(sector)
        
        props.sectorType  = data.readInt8()
        props.crc32Sum    = data.readInt32()
        props.next        = data.readInt64()
        props.created     = data.readInt64()
        props.modified    = data.readInt64()
        props.blockRange  = data.readInt8()
        const dataLength  = data.readInt16()
        data.bytesRead    = SectorSerialize.HEAD_META
        props.data        = data.read(dataLength)

        return props as HeadSector & CommonReadMeta

    }

    // Link sector ================================================================================

    /**
     * Serializes the link sector into a buffer ready to be written to the disk.  
     * -> Refer to link sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data object
     * @returns Sector data buffer
     */
    public createLinkSector(sector: LinkSector): Buffer {

        const data = Memory.alloc(this.SECTOR_SIZE)

        data.writeInt8(SectorType.LINK)
        data.writeInt32(sector.crc32Sum)
        data.writeInt64(sector.next)
        data.writeInt8(sector.blockRange)
        data.writeInt16(sector.data.length)
        data.bytesWritten = SectorSerialize.LINK_META
        data.write(sector.data)

        return data.buffer

    }

    /**
     * Deserializes a link sector that's been read from the disk into usable information.  
     * -> Refer to kink sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data buffer
     * @returns Sector data object
     */
    public readLinkSector(sector: Buffer): LinkSector & CommonReadMeta {

        const props: Partial<LinkSector & CommonReadMeta> = {}
        const data = Memory.intake(sector)

        props.sectorType    = data.readInt8()
        props.crc32Sum      = data.readInt32()
        props.next          = data.readInt64()
        props.blockRange    = data.readInt8()
        const dataLength    = data.readInt16()
        data.bytesRead      = SectorSerialize.LINK_META
        props.data          = data.read(dataLength)

        return props as LinkSector & CommonReadMeta

    }

    // Storage sector =============================================================================

    /**
     * Serializes the storage sector into a buffer ready to be written to the disk.  
     * -> Refer to storage sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data object
     * @returns Sector data buffer
     */
    public createStorageSector(sector: StorageSector): Buffer {

        const data = Memory.alloc(this.SECTOR_SIZE)

        data.writeInt8(SectorType.STORE)
        data.writeInt32(sector.crc32Sum)
        data.writeInt64(sector.next)
        data.writeInt8(sector.blockRange)
        data.writeInt16(sector.data.length)
        data.bytesWritten = SectorSerialize.STORE_META
        data.write(sector.data)

        return data.buffer

    }

    /**
     * Deserializes a storage sector that's been read from the disk into usable information.  
     * -> Refer to kink storage documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data buffer
     * @returns Sector data object
     */
    public readStorageSector(sector: Buffer): StorageSector & CommonReadMeta {

        const props: Partial<StorageSector & CommonReadMeta> = {}
        const data = Memory.intake(sector)

        props.sectorType    = data.readInt8()
        props.crc32Sum      = data.readInt32()
        props.next          = data.readInt64()
        props.blockRange    = data.readInt8()
        const dataLength    = data.readInt16()
        data.bytesRead      = SectorSerialize.STORE_META
        props.data          = data.read(dataLength)

        return props as StorageSector & CommonReadMeta
    }

}