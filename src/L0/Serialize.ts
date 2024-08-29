// Imports ====================================================================

import { crc32 } from "zlib"

import Memory from "@L0/Memory.js"
import AES, { AESCipher, AESKeySize } from "@L0/AES.js"
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
    /** 
     * Amount of bytes at the end of the last block sector that do not
     * contain data and should be stripped.
    */
    endPadding: number
}

export interface HeadBlock extends CommonMeta {
    /** File created date. */
    created: number
    /** File modified date. */
    modified: number
}

export interface LinkBlock extends CommonMeta {}
export interface StorageBlock extends CommonMeta {}

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
    
    // Configuration
    public readonly SECTOR_SIZE:   number
    public readonly HEAD_CONTENT:  number
    public readonly LINK_CONTENT:  number
    public readonly STORE_CONTENT: number

    constructor(config: BlockSerializeConfig) {
        this.SECTOR_SIZE   = config.diskSectorSize
        this.HEAD_CONTENT  = config.diskSectorSize - Serialize.HEAD_META
        this.LINK_CONTENT  = config.diskSectorSize - Serialize.LINK_META
        this.STORE_CONTENT = config.diskSectorSize - Serialize.STORE_META
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

    // Head block =================================================================================

    public createHeadBlock(block: HeadBlock) {}
    public readHeadBlock(block: HeadBlock) {}

    public createLinkBlock(block: LinkBlock) {}
    public readLinkBlock(block: LinkBlock) {}

    public createStorageBlock(block: StorageBlock) {}
    public readStorageBlock(block: StorageBlock) {}

}