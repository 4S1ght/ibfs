// Imports ========================================================================================

import Memory                                               from "@L0/Memory.js"
import BlockAES, { AESCipher, AESKeySize, BlockAESConfig }  from "@L0/AES.js"
import DSResult, { UnknownDSResult }                        from "@L0/DSResult.js"
import IBFSError                                            from "@errors"
import { ssc }                                              from "@misc"
import type * as T                                          from '@types'

// Types ==========================================================================================

export type SectorSize = typeof Serialize.SECTOR_SIZES[number]

export interface BlockSerializeConfig {
    /** Size of individual sectors in the virtual disk file. */
    diskSectorSize: SectorSize
}

// Root sector ====================================================================================

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
     * and tweak values for XTS encryption should be emulated by
     * appending them to the end half of the IV.
    */
    cryptoCompatMode: boolean
    /** 16 null bytes encrypted with the original key for key validity checks. */
    aesKeyCheck: Buffer
    /** Number of sectors inside the volume. */
    sectorCount: number
    /** 
     * Number of sectors following the root sector.
     * `metadataSectors * sectorSize` must amount to `>1MiB`.
     */
    metadataSectors: number
}

// Data blocks ====================================================================================

export interface HeadBlock {
    /** File created date. */
    created: number
    /** File modified date. */
    modified: number
    /** Address of the next block. */
    next: number
    /** The size of the next block (in sectors). */
    nextSize: number
    /** Block data. */
    data: Buffer
    /** Size of the block (in sectors) */
    blockSize: number
}

export interface LinkBlock {
    /** Address of the next block. */
    next: number
    /** The size of the next block (in sectors). */
    nextSize: number
    /** Block data. */
    data: Buffer
    /** Size of the block (in sectors) */
    blockSize: number
}

export interface StorageBlock {
    /** Block data. */
    data: Buffer
    /** Size of the block (in sectors) */
    blockSize: number
}

// Metadata =======================================================================================

export interface CommonReadMeta {
    /** 
     * Metadata providing information about the sector's type and its role. 
     * Exists purely for identification and potential data recovery tooling.
     */
    blockType: T.Values<typeof SectorType>
    /** CRC32 checksum of the block's content (after encryption) */
    crc32Sum: number
}

export interface CommonWriteMeta {
    /** AES encryption key for disk encryption. */
    aesKey?: Buffer
    /** Address of the block. */
    address: number
}

export interface HeadReadMeta {
    crcMismatch: boolean
}

// Helpers ========================================================================================

type Finalizer<ErrorCode extends IBFSError['code']> = {
    /** Block metadata */
    meta: T.Optional<HeadBlock & CommonReadMeta & HeadReadMeta, 'data' | 'crcMismatch'>
    /** 
     * Finalizer function that finishes deserializing the block.
     * It needs to be supplied the trailing data sectors after the
     * head/link/storage descriptor sector to decrypt and process the data.
     */
    final: (rawSectors?: Buffer) => IBFSError<ErrorCode> | undefined
    error?: undefined
} | {
    meta?: undefined,
    final?: undefined,
    error: IBFSError<ErrorCode>
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
    public readonly META_SIZE:     number

    public readonly AES: BlockAES

    constructor(config: BlockSerializeConfig & BlockAESConfig) {

        this.SECTOR_SIZE   = config.diskSectorSize
        this.HEAD_CONTENT  = config.diskSectorSize - Serialize.HEAD_META
        this.LINK_CONTENT  = config.diskSectorSize - Serialize.LINK_META
        this.STORE_CONTENT = config.diskSectorSize - Serialize.STORE_META
        this.META_SIZE     = config.diskSectorSize * Math.ceil(1024*1024 / config.diskSectorSize)

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
    public static createRootSector(sector: RootSector): T.XEav<Buffer, 'L0_BS_ROOT_SR'> {
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
            data.writeBool(sector.cryptoCompatMode)

            return [null, data.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_ROOT_SR', null, error as Error, sector), null]
        }
    }

    /**
     * Deserializes the root sector that's been read from the disk into usable information.
     * @param sector Sector data buffer
     * @returns Sector daa object
     */
    public static readRootSector(sector: Buffer): T.XEav<RootSector, 'L0_BS_ROOT_DS'> {
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
            props.cryptoCompatMode = data.readBool()

            return [null, props as RootSector]
        } 
        catch (error) {
            return [new IBFSError('L0_BS_ROOT_DS', null, error as Error, { sector }), null]
        }
    }

    // Meta block =================================================================================

    /**
     * Serializes a JSON object and produces a metadata block guaranteed to be at least 
     * 1MiB in size and is ready to be written to the disk.
     * @param block JSON object stored inside the block
     * @returns Buffer
     */
    public createMetaBlock(block: Object): T.XEav<Buffer, 'L0_BS_META_SR'> {
        try {
        
            const data = Memory.alloc(this.META_SIZE)

            const jsonString = Buffer.from(JSON.stringify(block))
            data.writeInt32(jsonString.length)
            data.bytesWritten = Serialize.MDATA_META
            data.write(jsonString)

            return [null, data.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_META_SR', null, error as Error, { block }), null]
        }
    }

    /**
     * Deserializes the metadata block into a JSON object.
     * @param block Raw metadata block
     * @returns Metadata object
     */
    public readMetaBlock<Metadata extends Object = Object>(block: Buffer): T.XEav<Metadata, 'L0_BS_META_DS'>  {
        try {
            
            const data = Memory.intake(block)

            const size = data.readInt32()
            data.bytesRead = Serialize.MDATA_META
            const jsonString = data.readString(size)

            return [null, JSON.parse(jsonString)]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_META_DS', null, error as Error, { block }), null]
        }
    }

    // Head block =================================================================================

    /**
     * Serializes head block data to produce a buffer that's ready to be written to the disk.   
     * The size of usable `data` must be determined in advance and match the `blockSize`.
     * @param blockData Block data and metadata
     * @returns Buffer
     */
    public createHeadBlock(block: HeadBlock & CommonWriteMeta): T.XEav<Buffer, 'L0_BS_HEAD_SR'> {
        try {

            const dist = Memory.alloc(this.SECTOR_SIZE * (block.blockSize+1))
            const src = Memory.intake(block.data)

            // Metadata
            dist.writeInt8(SectorType.HEAD)                                 // Block type
            dist.writeInt32(0)                                              // CRC
            dist.writeInt64(block.next)                                     // Next block address
            dist.writeInt8(block.nextSize)                                  // Next block size
            dist.writeInt8(block.blockSize)                                 // Head block size
            dist.writeInt64(block.created | 0)                              // Creation date
            dist.writeInt64(block.modified | 0)                             // Modification date
            dist.writeInt16(dist.length - Serialize.HEAD_META - src.length) // End sector padding (unencrypted)

            dist.bytesWritten = Serialize.HEAD_META
            dist.bytesRead = Serialize.HEAD_META

            // Head sector
            src.copyTo(dist, this.HEAD_CONTENT)
            let crc = this.AES.encryptCRC(dist.read(this.HEAD_CONTENT), block.aesKey!, block.address)

            // Raw sectors
            for (let i = 1; i <= block.blockSize; i++) {
                const address = block.address + i
                src.copyTo(dist, this.SECTOR_SIZE)
                crc = this.AES.encryptCRC(dist.read(this.SECTOR_SIZE), block.aesKey!, address, crc)
            }

            // CRC-32 checksum (after encryption)
            dist.bytesWritten = 1
            dist.writeInt32(crc)

            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_HEAD_SR', null, error as Error, ssc(block, ['data', 'aesKey'])), null]
        }
    }

    /**
     * Deserializes a head sector and returns an object containing that sector's metadata a `final` method or possibly a 
     * single error. The metadata contains all head sector information except for the file data.
     * For the file data to be fully serialized and become available in the returned metadata object, the `final` method
     * must be called and supplied the rest of the block sectors to finish block deserialization.
     * 
     * This method relies on dual-stage deserialization because it's impossible to know the size of a head block in 
     * advance before reading the main head sector.
     * 
     * @param headSector Block's head sector (in raw state)
     * @param blockAddress Address of where the sector was read from
     * @param aesKey Decryption key needed for decryption.
     * @returns Head sector data
     */
    public readHeadBlock(headSector: Buffer, blockAddress: number, aesKey?: Buffer): Finalizer<'L0_BS_HEAD_DS'> {
        try {

            // @ts-expect-error - Populated later
            const props: HeadBlock & CommonReadMeta & HeadReadMeta = {}
            const headSrc = Memory.intake(headSector)
            
            props.blockType   = headSrc.readInt8()  // Block type
            props.crc32Sum    = headSrc.readInt32() // CRC
            props.next        = headSrc.readInt64() // Next address
            props.nextSize    = headSrc.readInt8()  // Next block size
            props.blockSize   = headSrc.readInt8()  // Head block size
            props.created     = headSrc.readInt64() // Creation date
            props.modified    = headSrc.readInt64() // Modification date
            const endPadding  = headSrc.readInt16() // End sector padding (unencrypted)
            headSrc.bytesRead = Serialize.HEAD_META

            const dist = Memory.alloc(this.HEAD_CONTENT + this.SECTOR_SIZE * props.blockSize)

            // Head sector data
            headSrc.copyTo(dist, this.HEAD_CONTENT)
            let crc = this.AES.decryptCRC(dist.read(this.HEAD_CONTENT), aesKey!, blockAddress)

            return {
                meta: props,
                final: (sectors?: Buffer) => {
                    try {

                        if (sectors) {
                            const trailSrc = Memory.intake(sectors)

                            // Raw sectors
                            for (let i = 1; i <= props.blockSize; i++) {
                                trailSrc.copyTo(dist, this.SECTOR_SIZE)
                                crc = this.AES.decryptCRC(dist.read(this.SECTOR_SIZE), aesKey!, blockAddress+i, crc)
                            }
                        }

                        dist.bytesRead = 0
                        props.data = dist.read(dist.length - endPadding)
                        props.crcMismatch = props.crc32Sum !== crc

                    } 
                    catch (error) {
                        return new IBFSError('L0_BS_HEAD_DS', null, error as Error, { blockAddress })
                    }
                }
            }

        } 
        catch (error) {
            return {
                error: new IBFSError('L0_BS_HEAD_DS', null, error as Error, { blockAddress })
            }
        }
    }

    /**
     * Serializes link block data to produce a buffer that's ready to be written to the disk.  
     * The size of usable `data` must be determined in advance and match the `blockSize`.
     * @param blockData Block data and metadata
     * @returns Buffer
     */
    public createLinkBlock(block: LinkBlock & CommonWriteMeta): T.XEav<Buffer, 'L0_BS_LINK_SR'> {
        try {
            
            const dist = Memory.alloc(this.SECTOR_SIZE * (block.blockSize+1))
            const src = Memory.intake(block.data)

            dist.writeInt8(SectorType.LINK)                                 // Block type
            dist.writeInt32(0)                                              // CRC
            dist.writeInt64(block.next)                                     // Next block address
            dist.writeInt8(block.nextSize)                                  // Next block size
            dist.writeInt8(block.blockSize)                                 // Block size
            dist.writeInt16(dist.length - Serialize.LINK_META - src.length) // End sector padding (unencrypted)

            dist.bytesWritten = Serialize.LINK_META
            dist.bytesRead = Serialize.LINK_META

            // Link sector
            src.copyTo(dist, this.LINK_CONTENT)
            let crc = this.AES.encryptCRC(dist.read(this.LINK_CONTENT), block.aesKey!, block.address)

            // Raw sectors
            for (let i = 1; i <= block.blockSize; i++) {
                const address = block.address + i
                src.copyTo(dist, this.SECTOR_SIZE)
                crc = this.AES.encryptCRC(dist.read(this.SECTOR_SIZE), block.aesKey!, address, crc)
            }

            // CRC-32 checksum (after encryption)
            dist.bytesWritten = 1
            dist.writeInt32(crc)

            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_LINK_SR', null, error as Error, ssc(block, ['data', 'aesKey'])), null]
        }
    }

    /**
     * Deserializes a link block and returns an object containing its data and metadata.
     * @param headSector Block's head sector (in raw state)
     * @param blockAddress Address of where the sector was read from
     * @param aesKey Decryption key needed for decryption.
     * @returns Head sector data
     */
    public readLinkBlock(linkBlock: Buffer, blockAddress: number, aesKey?: Buffer): UnknownDSResult<LinkBlock, 'L0_BS_LINK_DS'>{
        try {
            
            // @ts-expect-error - Populated later
            const props: LinkBlock & CommonReadMeta = {}
            const src = Memory.intake(linkBlock)

            props.blockType     = src.readInt8()    // Block type
            props.crc32Sum      = src.readInt32()   // CRC
            props.next          = src.readInt64()   // Next block address
            props.nextSize      = src.readInt8()    // Next block size
            props.blockSize     = src.readInt8()    // Block size
            const endPadding    = src.readInt16()   // End sector padding (unencrypted)
            src.bytesRead       = Serialize.LINK_META

            const dist = Memory.alloc(this.LINK_CONTENT + this.SECTOR_SIZE * props.blockSize)

            // Link sector data
            src.copyTo(dist, this.LINK_CONTENT)
            let crc = this.AES.decryptCRC(dist.read(this.LINK_CONTENT), aesKey!, blockAddress)

            // Raw sectors
            for (let i = 1; i <= props.blockSize; i++) {
                src.copyTo(dist, this.SECTOR_SIZE)
                crc = this.AES.decryptCRC(dist.read(this.SECTOR_SIZE), aesKey!, blockAddress+i, crc)
            }
        
            dist.bytesRead = 0
            props.data = dist.read(dist.length - endPadding)

            return DSResult.success(props, crc)

        } 
        catch (error) {
            return DSResult.failure('L0_BS_LINK_DS', null, error as Error, { blockAddress })
        }
    }

    /**
     * Serializes storage block data to produce a buffer that's ready to be written to the disk.  
     * The size of usable `data` must be determined in advance and match the `blockSize`.
     * @param blockData Block data and metadata
     * @returns Buffer
     */
    public createStorageBlock(block: StorageBlock & CommonWriteMeta): T.XEav<Buffer, 'L0_BS_STORE_SR'> {
        try {
            
            const dist = Memory.alloc(this.SECTOR_SIZE * (block.blockSize+1))
            const src = Memory.intake(block.data)
            
            dist.writeInt8(SectorType.STORE)                                 // Block type
            dist.writeInt32(0)                                               // CRC
            dist.writeInt8(block.blockSize)                                  // Block size
            dist.writeInt16(dist.length - Serialize.STORE_META - src.length) // End sector padding (unencrypted)

            dist.bytesWritten = Serialize.STORE_META
            dist.bytesRead = Serialize.STORE_META

            // Link sector
            src.copyTo(dist, this.STORE_CONTENT)
            let crc = this.AES.encryptCRC(dist.read(this.STORE_CONTENT), block.aesKey!, block.address)

            // Raw sectors
            for (let i = 1; i <= block.blockSize; i++) {
                const address = block.address + i
                src.copyTo(dist, this.SECTOR_SIZE)
                crc = this.AES.encryptCRC(dist.read(this.SECTOR_SIZE), block.aesKey!, address, crc)
            }

            // CRC-32 checksum (after encryption)
            dist.bytesWritten = 1
            dist.writeInt32(crc)

            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_STORE_SR', null, error as Error, ssc(block, ['data', 'aesKey'])), null]
        }
    }

    /**
     * Deserializes a storage block and returns an object containing its data and metadata.
     * @param headSector Block's head sector (in raw state)
     * @param blockAddress Address of where the sector was read from
     * @param aesKey Decryption key needed for decryption.
     * @returns Head sector data
     */
    public readStorageBlock(storeBlock: Buffer, blockAddress: number, aesKey?: Buffer): UnknownDSResult<StorageBlock, 'L0_BS_STORE_DS'> {
        try {
            
            // @ts-expect-error - Populated later
            const props: StorageBlock & CommonReadMeta = {}
            const src = Memory.intake(storeBlock)

            props.blockType     = src.readInt8()        // Block type
            props.crc32Sum      = src.readInt32()       // CRC
            props.blockSize     = src.readInt8()        // Block size
            const endPadding    = src.readInt16()       // End sector padding (unencrypted)

            src.bytesRead       = Serialize.STORE_META
            const dist = Memory.alloc(this.STORE_CONTENT + this.SECTOR_SIZE * props.blockSize)

            // Link sector data
            src.copyTo(dist, this.STORE_CONTENT)
            let crc = this.AES.decryptCRC(dist.read(this.STORE_CONTENT), aesKey!, blockAddress)

            // Raw sectors
            for (let i = 1; i <= props.blockSize; i++) {
                src.copyTo(dist, this.SECTOR_SIZE)
                crc = this.AES.decryptCRC(dist.read(this.SECTOR_SIZE), aesKey!, blockAddress+i, crc)
            }
        
            dist.bytesRead = 0
            props.data = dist.read(dist.length - endPadding)
            
            return DSResult.success(props, crc)

        } 
        catch (error) {
            return DSResult.failure('L0_BS_STORE_DS', null, error as Error, { blockAddress })
        }
    }

    /**
     * Resolves resource location by its address.
     * @param address Sector address
     */
    public resolveAddr = (address: number) => this.SECTOR_SIZE * address

}   