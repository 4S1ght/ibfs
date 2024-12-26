// Imports ========================================================================================

import { BLOCK_SIZES } from '../Constants'

// Types ==========================================================================================

type TBlockSize = typeof BLOCK_SIZES[number]
type TAESCipher = 'aes-xts-128' | 'aes-xts-256' | 'none'

export interface TRootBlock {
    /** The size of individual sectors inside the volume. */
    blockSize: TBlockSize
    /** Specification version (major). */
    specMajor: number
    /** Specification version (minor). */
    specMinor: number
    /** Address of the volume's root directory. */
    root: number
    /** The AES/XTS cipher used for volume encryption. */
    aesCipher: TAESCipher
    /** The Initialization Vector (IV) used for encryption. */
    aesIV: Buffer
    /** 
     * Describes whether the volume was created in compatibility mode.
     * Such volumes need to be encrypted with emulated tweaks by combining
     * first half of the IV with the sector address. This is to enable
     * compatibility with crypto APIs that don't support tweak values.
     */
    compatibility: boolean
    /** 16 null bytes encrypted with the original key for key validity checks. */
    aesKeyCheck: Buffer
    /** NUmber of addressable blocks (including metadata) */
    blockCount: number
    /** 
     * Number of blocks following the root block reserved for
     * arbitrary driver settings.
     */
    metadataBlocks: number

}

// Exports ========================================================================================

/**
 * 
    Index |  Size  |  Type    |  Description
    ------|--------|----------|-----------------------------------
    0     |  4B    |  Int32   |  Block size
    4     |  2B    |  Int16   |  Spec major
    6     |  2B    |  Int16   |  Spec minor
    8     |  8B    |  Int64   |  Root directory block address
    16    |  1B    |  Int8    |  AES cipher used (0: none, 1: 128Bit, 2: 256Bit)
    17    |  16B   |  Buffer  |  AES IV
    33    |  1B    |  Int8    |  Compatibility mode (0: off, 1: on)
    34    |  16B   |  Buffer  |  AES key check
    50    |  8B    |  Int64   |  Number of addressable blocks
    58    |  4B    |  Int32   |  Number of metadata blocks

 */
export default class RootBlock implements TRootBlock {

    public buffer: Buffer

    private constructor() { }

    public static create(data: TRootBlock) {

        const block = new RootBlock()

        block.buffer         = Buffer.allocUnsafe(62).fill(0)
        block.blockSize      = data.blockSize
        block.specMajor      = data.specMajor
        block.specMinor      = data.specMinor
        block.root           = data.root
        block.aesCipher      = data.aesCipher
        block.aesIV          = data.aesIV
        block.compatibility  = data.compatibility
        block.aesKeyCheck    = data.aesKeyCheck
        block.blockCount     = data.blockCount

        block.metadataBlocks = data.metadataBlocks
        return block
        
    }

    public static flatten(rootBlock: TRootBlock): RootBlock {
    
        const block = new RootBlock()
        block.buffer = Buffer.allocUnsafe(rootBlock.blockSize).fill(0)
        return block

    }

    // ------------------------------------------------------------------------

    get blockSize() { return this.buffer.readUInt8(0) as TBlockSize }
    set blockSize(value: TBlockSize) { this.buffer.writeInt8(value, 0) }

    get specMajor() { return this.buffer.readUInt16LE(4) }
    set specMajor(value: number) { this.buffer.writeUInt16LE(value, 4) }

    get specMinor() { return this.buffer.readUInt16LE(6) }
    set specMinor(value: number) { this.buffer.writeUInt16LE(value, 6) }

    get root() { return Number(this.buffer.readBigUInt64LE(8)) }
    set root(value: number) { this.buffer.writeBigUInt64LE(BigInt(value), 8) }

    get aesCipher() { return ({ 0: 'none', 1: 'aes-xts-128', 2: 'aes-xts-256'} as const)[this.buffer.readUInt8(16)]! }
    set aesCipher(value: TAESCipher) { this.buffer.writeUInt8(({ none: 0, 'aes-xts-128': 1, 'aes-xts-256': 2})[value], 16) }

    get aesIV() { return this.buffer.subarray(17, 33) }
    set aesIV(value: Buffer) { value.copy(this.buffer, 17) }

    get compatibility() { return Boolean(this.buffer.readUInt8(33)) }
    set compatibility(value: boolean) { this.buffer.writeUInt8(Number(value), 33) }

    get aesKeyCheck() { return this.buffer.subarray(34, 50) }
    set aesKeyCheck(value: Buffer) { value.copy(this.buffer, 34) }

    get blockCount() { return Number(this.buffer.readBigUInt64LE(50)) }
    set blockCount(value: number) { this.buffer.writeBigUInt64LE(BigInt(value), 50) }

    get metadataBlocks() { return this.buffer.readUInt32LE(58) }
    set metadataBlocks(value: number) { this.buffer.writeUInt32LE(value, 58) }

}