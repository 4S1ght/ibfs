// Imports ====================================================================

import Memory from './Memory.js'
import IBFSError from '../errors/IBFSError.js'

import type { AESCipher, AESKeySize } from './BlockAES.js'

// Types ======================================================================

type BlockSize = typeof BlockSerialize.BLOCK_SIZES[number]

export interface SerializeConfig {
    /** Block size used inside the volume. */
    blockSize: BlockSize
}

export interface CommonMeta {
    /** 
     * Metadata providing information about the locks's type and its role. 
     * Exists purely for identification and potential data recovery tooling.
     */
    //@ts-ignore
    blockType: Values<typeof BlockType>
}


export interface RootBlock {
    /** The size of individual blocks inside the volume. */
    blockSize: BlockSize
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
    /** Number of blocks inside the volume. */
    blockCount: number
    /** Number of raw data blocks following the root block. */
    metadataBlocks: number
}


enum BlockType {
    HEAD  = 1,
    LINK  = 2,
    STORE = 3,
}

// Module =====================================================================

export default class BlockSerialize {

    // Constants
    public static readonly BLOCK_SIZES = [ 1024, 2048, 4096, 8192, 16384, 32768 ] as const
    public static readonly HEAD_META   = 64
    public static readonly LINK_META   = 32
    
    // Configuration
    public readonly BLOCK_SIZE:   number
    public readonly HEAD_CONTENT: number
    public readonly LINK_CONTENT: number

    constructor(config: SerializeConfig) {
        this.BLOCK_SIZE   = config.blockSize
        this.HEAD_CONTENT = config.blockSize - BlockSerialize.HEAD_META
        this.LINK_CONTENT = config.blockSize - BlockSerialize.LINK_META
    }

    /**
     * Serializes root block configuration into a buffer ready to be written to the disk.  
     * @param sector Block data object
     * @returns Block data buffer
     */
    public static createRootBlock(block: RootBlock) {

        const data = Memory.alloc(block.blockSize)

        data.writeInt16(block.specMajor)
        data.writeInt16(block.specMinor)
        data.writeInt32(block.blockSize)
        data.writeInt64(block.rootDirectory)
        data.writeInt16(block.aesCipher)
        data.write(block.aesIV)
        data.writeBool(block.nodeCryptoCompatMode)
        data.writeInt64(block.blockCount)
        data.writeInt16(block.metadataBlocks)

        return data.buffer

    }

    /**
     * Deserializes the root block that's been read from the disk into usable information.
     * @param sector Block data buffer
     * @returns Block daa object
     */
    public static readRootBlock(sector: Buffer): RootBlock {

        const props: Partial<RootBlock> = {}
        const data = Memory.intake(sector)

        props.specMajor            = data.readInt16()
        props.specMinor            = data.readInt16()
        props.blockSize            = data.readInt32() as BlockSize
        props.rootDirectory        = data.readInt64()
        props.aesCipher            = data.readInt16() as AESCipher
        props.aesIV                = data.read(16)
        props.nodeCryptoCompatMode = data.readBool()
        props.blockCount           = data.readInt64()
        props.metadataBlocks       = data.readInt16()

        return props as RootBlock

    }





}