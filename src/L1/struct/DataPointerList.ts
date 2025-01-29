// DPL (Data Pointer List) is a linked-list structure comprised of a starting head block followed
// by link blocks that sequentially store addresses of data blocks. It serves as a compromise
// between fixed-size allocation tables and linked-lists, providing adequate I/O speeds while
// retaining flexibility and relatively low implementation complexity.

import * as T from "../../../types.js"

import IBFSError from "../../errors/IBFSError.js"
import Volume from "../../L0/Volume.js"

// Types ==========================================================================================

export interface TDPLCreate {
    /** The starting address of the data pointer list. */  fplAddress: number
    /** The volume that contains the data pointer list. */ volume: Volume
}

export interface TDPLOpen {
    /** The starting address of the data pointer list. */  fplAddress: number
    /** The volume that contains the data pointer list. */ volume: Volume
}

// Exports ========================================================================================

export default class DataPointerList {

    private constructor() {}

    // Factory ------------------------------------------------------

    public static async create(create: TDPLCreate): T.XEavA<DataPointerList, "L1_DPL_CREATE"> {
        try {
            const self = new this()
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_DPL_CREATE', null, error as Error)
        }
    }

    // Lifecycle ----------------------------------------------------

    public static async open(open: TDPLOpen): T.XEavA<DataPointerList, "L1_DPL_OPEN"> {
        try {
            const self = new this()
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_DPL_OPEN', null, error as Error)    
        }
    }

    // Methods ------------------------------------------------------

}