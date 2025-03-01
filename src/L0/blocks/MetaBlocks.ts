// Imports =============================================================================================================

import IBFSError from "../../errors/IBFSError.js"
import Struct from "../Struct.js"

// Types ===============================================================================================================

export interface TMetadata {
    [key: string]: any
}

// Exports =============================================================================================================

export default class MetaBlocks {

    public declare struct: Struct
    public declare metadata: TMetadata

    private constructor() {}

    /** Allocates memory for a new cluster and returns a new MetaBlocks instance that maps to it. */
    public static alloc(size: number) {
        const self = new this()
        self.struct = Struct.alloc(size)
        self.metadata = {}
        return self
    }

    /** Warps existing memory and returns a new MetaBlocks instance that maps to it. */
    public static from(buffer: Buffer) {

        const self = new this()
        self.struct = Struct.wrap(buffer)

        const firstNullByte = self.struct.indexOf(0)
        const textEnd = firstNullByte > -1 ? firstNullByte : self.struct.length - 1
        const text = self.struct.buffer.toString('utf-8', 0, textEnd)
        self.metadata = JSON.parse(text)

        return self
    
    }

    /** Finalizes the metadata block cluster and returns its internal buffer so it can be written to the disk. */
    public final() {
        const jsonString = JSON.stringify(this.metadata)
        if (jsonString.length > this.struct.length) throw new IBFSError('L0_SR_META_SEGFAULT')
        this.struct.empty()
        this.struct.writeString(0, jsonString)
    }

}