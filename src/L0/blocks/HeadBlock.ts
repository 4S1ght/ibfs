// Imports =============================================================================================================

import Struct from "../Struct.js"

// Types ===============================================================================================================

// Exports =============================================================================================================

/**
 * Serializes a head block and returns a buffer that can be written to the disk.
 * 
    Index | Size | Type   | Description
    ------|------|--------|------------------------------------------------
    0     | 1B   | Int8   | Block type (HEAD)
    1     | 4B   | Int32  | CRC checksum
    5     | 8B   | Int64  | Next block address
    13    | 8B   | Int64  | Creation date (Unix timestamp - seconds)
    21    | 8B   | Int64  | Modification date (Unix timestamp - seconds)
    25    | 4B   | Int32  | Size of usable block data
    26    | 1B   | Int8   | Resource type
*/
export default class HeadBlock {

    private declare struct: Struct
    private constructor() {}

    /** Allocates memory for a new block and returns a new HeadBlock instance that maps to it. */
    public static alloc(size: number, blockAddress: number) {
        const self = new this()
        self.struct = Struct.alloc(size)
        return self
    }

    /** Wraps existing memory and returns a new HeadBlock instance that maps to it. */
    public static from(buffer: Buffer, blockAddress: number, aesKey: Buffer) {
        const self = new this()
        self.struct = Struct.wrap(buffer)
        return self
    }

    /** Finalizes the root block and returns its internal buffer so it can be written to the disk. */
    public final() {
        return this.struct.buffer
    }

    public  get blockType()                         { return this.struct.readInt8(0) }

    public  get crc32sum()                          { return this.struct.readInt32(1) }
    private set crc32sum(value: number)             { this.struct.writeInt32(1, value) }

    public  get next()                              { return this.struct.readInt64(5) }
    public  set next(value: number)                 { this.struct.writeInt64(5, value) }





}