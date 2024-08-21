// Imports ====================================================================

import Memory from './Memory.js'
import type { AESCipher, AESKeySize } from './SectorAES.js'

// Types ======================================================================

export type SectorSize = typeof SectorSerialize.SECTOR_SIZES[number]

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

// Module =====================================================================

export default class SectorSerialize {

    // Constants
    public static readonly SECTOR_SIZES = [ 1024, 2048, 4096, 8192, 16384, 32768 ] as const
    
    // Configuration
    public readonly SECTOR_SIZE: number

    constructor(config: SectorSerializeConfig) {
        this.SECTOR_SIZE = config.sectorSize
    }

    /**
     * Serializes root sector configuration into a buffer ready
     * to be written to the disk.  
     * -> Refer to root sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector metadata
     * @returns Buffer
     */
    public static createRootSector(sector: RootSector): Buffer {

        const data = Memory.allocate(sector.sectorSize)

        data.writeInt16(sector.specMajor)
        data.writeInt16(sector.specMinor)
        data.writeInt32(sector.sectorSize)
        data.writeInt64(sector.rootDirectory)
        data.writeInt16(sector.aesCipher)
        data.write(sector.aesIV)
        data.writeInt64(sector.sectorCount)
        data.writeInt16(sector.metadataSectors)

        return data.bytes

    }

    /**
     * Deserializes a root sector that's been read from the disk
     * into usable information.  
     * -> Refer to root sector documentation in [the specification](../../spec/spec-1.0.md).
     * @param sector Sector data
     * @returns Sector metadata
     */
    public static readRootSector(sector: Buffer): RootSector {

        const props: Partial<RootSector> = {}
        const data = Memory.intake(sector)

        props.specMajor       = data.readInt16()
        props.specMinor       = data.readInt16()
        props.sectorSize      = data.readInt32() as SectorSize
        props.rootDirectory   = data.readInt64()
        props.aesCipher       = data.readInt16() as AESCipher
        props.aesIV           = data.read(16)
        props.sectorCount     = data.readInt64()
        props.metadataSectors = data.readInt16()

        return props as RootSector

    }

}