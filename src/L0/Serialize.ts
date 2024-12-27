// Imports ========================================================================================

import type * as T from '../../types.d'

import Memory from './Memory'
import AES, { TAESConfig } from './AES'
import IBFSError from '../errors/IBFSError'

// Types ==========================================================================================

export interface TSerializeConfig {
    blockSize: keyof typeof Serialize.BLOCK_SIZES
}

// Root block =====================================================================================

export interface TRootBlock {
    /** The size of individual blocks inside the volume. */
    blockSize: keyof typeof Serialize.BLOCK_SIZES
    /** Specification version (major). */
    specMajor: number
    /** Specification version (minor). */
    specMinor: number
    /** Address of the volume's root directory. */
    root: number
    /** The AES/XTS cipher used for volume encryption. */
    aesCipher: 0 | 1 | 2
    /** The Initialization Vector (IV) used for encryption */
    aesIV: Buffer
    /** Mode of compatibility with nodejs crypto API */
    compatibility: boolean
    /** 16 null bytes encrypted with the original key for key validity checks. */
    aesKeyCheck: Buffer
    /** Number of addressable blocks (including metadata) */
    blockCount: number
    /** Number of blocks following the root block reserved for arbitrary driver settings. */
    arbitraryBlocks: number
}

// Exports ========================================================================================

export default class Serialize {

    // Constants
    public static readonly BLOCK_SIZES = {
        1:  1024,     // 1kB
        2:  2048,     // 2kB
        3:  4096,     // 4kB
        4:  8192,     // 8kB
        5:  16384,    // 16kB
        6:  32768,    // 32kB
        7:  65536,    // 64kB
        8:  131072,   // 128kB
        9:  262144,   // 256kB
        10: 524288,   // 512kB
        11: 1048576,  // 1MB
        12: 2097152,  // 2MB
        13: 4194304,  // 4MB
        14: 8388608,  // 8MB
        15: 16777216, // 16MB
    } as const

    public static readonly HEAD_META = 64
    public static readonly LINK_META = 32
    public static readonly STORAGE_META = 32
    public static readonly VDATA_META = 16

    public readonly BLOCK_SIZE: number
    public readonly HEAD_BODY: number
    public readonly LINK_BODY: number
    public readonly STORAGE_BODY: number
    public readonly ARB_SIZE: number

    public readonly crypto: AES

    constructor(config: TSerializeConfig & TAESConfig) {

        this.BLOCK_SIZE     = Serialize.BLOCK_SIZES[config.blockSize]
        this.HEAD_BODY      = this.BLOCK_SIZE - Serialize.HEAD_META
        this.LINK_BODY      = this.BLOCK_SIZE - Serialize.LINK_META
        this.STORAGE_BODY   = this.BLOCK_SIZE - Serialize.STORAGE_META
        this.ARB_SIZE       = Math.ceil(1024*64 / this.BLOCK_SIZE) * this.BLOCK_SIZE

        this.crypto = new AES({
            iv: config.iv,
            cipher: config.cipher
        })

    }

    // Root block =================================================================================

    public static serializeRootBlock(block: TRootBlock): T.XEav<Buffer, "L0_SR_SRFAIL_ROOT"> {
        try {
            
            const data = Memory.alloc(block.blockSize)

            data.writeInt16(block.specMajor)
            data.writeInt16(block.specMinor)
            data.writeInt8(block.blockSize)
            data.writeInt64(block.blockCount)
            data.writeInt64(block.arbitraryBlocks)
            data.writeBool(block.compatibility)
            data.writeInt64(block.root)
            data.writeInt8(block.aesCipher)
            data.write(block.aesIV)
            data.write(block.aesKeyCheck)

            return [null, data.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_SR_SRFAIL_ROOT', null, error as Error, block), null]    
        }
    }



}