// Imports =============================================================================================================

import Struct from "../Struct.js"
import { TAESCipher } from "../BlockAES.js"
import BlockSerializationContext from "../BlockSerialization.js"

// Types ===============================================================================================================

export interface TRootBlock {
    /** Specification version (major)                    */ specMajor:      number
    /** Specification version (minor)                    */ specMinor:      number
    /** Root block address                               */ rootAddress:    number
    /** AES cipher used                                  */ aesCipher:      TAESCipher
    /** AES initialization vector                        */ aesIV:          Buffer
    /** 0-filled buffer encrypted with the original key  */ aesKeyCheck:    Buffer
    /** Crypto tweak emulation compatibility mode        */ compatibility:  boolean
    /** Block size (levels 1-15)                         */ blockSize:      keyof typeof BlockSerializationContext.BLOCK_SIZES
    /** Number of blocks in the volume                   */ blockCount:     number
}

// Exports =============================================================================================================

/** 
* Represents a volume's root block.
* 
    Index | Size | Type   | Description
    ------|------|--------|------------------------------------------------
    0     | 2B   | Int16  | Spec major
    2     | 2B   | Int16  | Spec minor
    4     | 8B   | Int64  | Root directory block address
    12    | 1B   | Int8   | AES cipher used (0: none, 1: 128-Bit, 2: 256-Bit)
    13    | 16B  | Buffer | AES IV
    29    | 16B  | Buffer | AES key check
    45    | 1B   | Int8   | Compatibility mode (0: off, 1: on)
    46    | 1B   | Int8   | Block size
    47    | 8B   | Int64  | Block count
    55    | 64B  | UTF-8  | Comment
*/
export default class RootBlock implements TRootBlock {

    public declare struct: Struct

    private constructor() {}

    /** Allocates memory for a new block and returns a new RootBlock instance that maps to it. */
    public static alloc(size: number) {
        const self = new this()
        self.struct = Struct.alloc(size)
        return self
    }

    /** Wraps existing memory and returns a new RootBlock instance that maps to it. */
    public static wrap(buffer: Buffer) {
        const self = new this()
        self.struct = Struct.wrap(buffer)
        return self
    }

    /** Finalizes any in-flight changes and returns the underlying buffer */
    public final() {
        return this.struct
    }

    set specMajor(value: number)                    { this.struct.writeInt16(0, value) }
    get specMajor()                                 { return this.struct.readInt16(0) }

    set specMinor(value: number)                    { this.struct.writeInt16(2, value) }
    get specMinor()                                 { return this.struct.readInt16(2) }

    set rootAddress(value: number)                  { this.struct.writeInt64(4, value) }
    get rootAddress()                               { return this.struct.readInt64(4) }

    set aesCipher(value: TAESCipher)                { this.struct.writeInt8(12, ['none', 'aes-128-xts', 'aes-256-xts'].indexOf(value)) }
    get aesCipher()                                 { return (['none', 'aes-128-xts', 'aes-256-xts'] as const)[this.struct.readInt8(12)]! }

    set aesIV(value: Buffer)                        { this.struct.write(13, value) }
    get aesIV()                                     { return this.struct.read(13, 16) }

    set aesKeyCheck(value: Buffer)                  { this.struct.write(29, value) }
    get aesKeyCheck()                               { return this.struct.read(29, 16) }

    set compatibility(value: boolean)               { this.struct.writeBool(45, value) }
    get compatibility()                             { return this.struct.readBool(45) }

    set blockSize(value: TRootBlock['blockSize'])   { this.struct.writeInt8(46, value) }
    get blockSize()                                 { return this.struct.readInt8(46) as TRootBlock['blockSize'] }

    set blockCount(value: number)                   { this.struct.writeInt64(47, value) }
    get blockCount()                                { return this.struct.readInt64(47) }

    set comment(value: string)                      { this.struct.writeString(55, value) }
    get comment()                                   { return this.struct.readString(55, 64).split('\0')[0]! }


}