// Imports ========================================================================================

import * as C from '../../Constants.js'
import type { TAesCipher } from '../AES.js'

// Types ==========================================================================================

type TBlockSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

export interface TRootBlock {
    /** Specification version (major). */
    specMajor: number
    /** Specification version (minor). */
    specMinor: number
    /** Address of the volume's root directory. */
    root: number
    /** The AES/XTS cipher used for volume encryption. */
    aesCipher: TAesCipher
    /** The Initialization Vector (IV) used for encryption */
    aesIV: Buffer
    /** 16 null bytes encrypted with the original key for key validity checks. */
    aesKeyCheck: Buffer
    /** Mode of compatibility with nodejs crypto API */
    compatibility: boolean
    /** The size of individual blocks inside the volume. */
    blockSize: TBlockSize
    /** Number of addressable blocks (excluding metadata) */
    blockCount: number
    /** Number of blocks following the root block reserved for arbitrary driver settings. */
    metadataBlocks: number
}

/**
    Index | Size  | Type   | Description
    ------|-------|--------|-----------------------------------------------
    0     | 2B    | Int16  | Spec major
    2     | 2B    | Int16  | Spec minor
    4     | 8B    | Int64  | Root directory block address
    12    | 1B    | Int8   | AES cipher used (0: none, 1: 128Bit, 2: 256Bit)
    13    | 16B   | Buffer | AES IV
    29    | 16B   | Buffer | AES key check
    45    | 1B    | Int8   | Compatibility mode (0: off, 1: on)
    46    | 1B    | Int8   | Block size
    47    | 8B    | Int64  | Block count - addressable
    55    | 4B    | Int32  | Metadata blocks - amount
*/

export default class RootBlock implements TRootBlock {

    public static readonly BLOCK_SIZES = { 
        1:  C.KB_1,  2: C.KB_2,  3: C.KB_4,   4: C.KB_8,    5: C.KB_16, 
        6:  C.KB_32, 7: C.KB_64, 8: C.KB_128, 9: C.KB_256, 10: C.KB_512, 
        11: C.MB_1, 12: C.MB_2, 13: C.MB_4,  14: C.MB_8,   15: C.MB_16
    } as const

    // Internal =====================================================

    public declare readonly buffer: Buffer

    // Methods ======================================================

    private constructor() {}

    /** 
     * Creates a new root block and populates it with `data`. 
     */
    public static create(data: TRootBlock): RootBlock {
        
        const self = new this()
        // @ts-ignore
        self.buffer = Buffer.allocUnsafe(RootBlock.BLOCK_SIZES[data.blockSize]).fill(0)

        self.specMajor      = data.specMajor
        self.specMinor      = data.specMinor
        self.root           = data.root
        self.aesCipher      = data.aesCipher
        self.aesIV          = data.aesIV
        self.aesKeyCheck    = data.aesKeyCheck
        self.compatibility  = data.compatibility
        self.blockSize      = data.blockSize
        self.blockCount     = data.blockCount
        self.metadataBlocks = data.metadataBlocks

        return self

    }

    /** 
     * Creates a root block from an existing buffer and allows for reading its properties 
     * through the RootBlock interface. This should be used primarily for reads from the disk.
     */
    public static from(buffer: Buffer): RootBlock {
        const self = new this()
        // @ts-ignore
        self.buffer = buffer
        return self
    }

    // Properties ===================================================

    get specMajor() { return this.buffer.readUInt16LE(0) }
    set specMajor(value: number) {  this.buffer.writeUInt16LE(value, 0) }

    get specMinor() { return this.buffer.readUInt16LE(2) }
    set specMinor(value: number) { this.buffer.writeUInt16LE(value, 2) }

    get root() { return Number(this.buffer.readBigInt64LE(4)) }
    set root(value: number) { this.buffer.writeBigInt64LE(BigInt(value), 4) }

    get aesCipher() { return ['none', 'aes-128-xts', 'aes-256-xts'][this.buffer.readUInt8(12)] as TAesCipher }
    set aesCipher(value: TAesCipher) { this.buffer.writeUInt8(['none', 'aes-128-xts', 'aes-256-xts'].indexOf(value), 12) }

    get aesIV() { 
        const iv = Buffer.alloc(16)
        this.buffer.subarray(13, 29).copy(iv)
        return iv
    }
    set aesIV(value: Buffer) { value.copy(this.buffer, 13) }

    get aesKeyCheck() {
        const keyCheck = Buffer.alloc(16)
        this.buffer.subarray(29, 45).copy(keyCheck)
        return keyCheck
    }
    set aesKeyCheck(value: Buffer) { value.copy(this.buffer, 29) }

    get compatibility() { return this.buffer.readUInt8(45) === 1 }
    set compatibility(value: boolean) { this.buffer.writeUInt8(value ? 1 : 0, 45) }

    get blockSize() { return this.buffer.readUInt8(46) as TBlockSize }
    set blockSize(value: TBlockSize) { this.buffer.writeUInt8(value, 46) }

    get blockCount() { return Number(this.buffer.readBigInt64LE(47)) }
    set blockCount(value: number) { this.buffer.writeBigInt64LE(BigInt(value), 47) }

    get metadataBlocks() { return this.buffer.readUint32LE(55) }
    set metadataBlocks(value: number) { this.buffer.writeUInt32LE(value, 55) }


}
