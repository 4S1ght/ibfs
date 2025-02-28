// Imports =============================================================================================================

import IBFSError from "../../errors/IBFSError.js"
import Struct from "../Struct.js"

// Types ===============================================================================================================

export interface TMetadata {
    metadata: {
        [key: string]: any
    }
}

// Exports =============================================================================================================

export default class MetaBlocks {

    public declare struct: Struct

    private constructor() {}

    /** Allocates memory for a new cluster and returns a new MetaBlocks instance that maps to it. */
    public static alloc(size: number) {
        const self = new this()
        self.struct = Struct.alloc(size)
        return self
    }

    /** Warps existing memory and returns a new MetaBlocks instance that maps to it. */
    public static from(buffer: Buffer) {
        const self = new this()
        self.struct = Struct.wrap(buffer)
        return self
    }

    get metadata(): any {
        const firstNullByte = this.struct.buffer.indexOf(0)
        const textEnd = firstNullByte === -1 ? this.struct.buffer.length - 1 : firstNullByte
        const text = this.struct.buffer.toString('utf-8', 0, textEnd)
        return JSON.parse(text)
    }
    set metadata(props: any) {
        const jsonString = JSON.stringify(props)
        if (jsonString.length > this.struct.length) throw new IBFSError('L0_SR_META_SEGFAULT')
        this.struct.empty()
        this.struct.writeString(0, jsonString)
    }

}