// Top-level file descriptor
// This class represents the top level linked list storing sequential addresses
// of file's data blocks and exposes methods for appending and traversing them.

// Imports ========================================================================================

import type * as T from "../../../types.js"
import type { THeadBlock, TLinkBlock } from "../../L0/BlockSerialization.js"

import IBFSError from "../../errors/IBFSError.js"
import Volume from "../../L0/Volume.js"

// Types ==========================================================================================

type TOpenFlag =
  | "READ"                  // [r] Read-only, must exist
  | "READ_WRITE"            // [r+] Read + Write, must exist
  | "OVERWRITE"             // [w] Write, truncate if exists, create if not
  | "OVERWRITE_READ"        // [w+] Read + Write, truncate if exists, create if not
  | "APPEND"                // [a] Write, always append, create if not exists
  | "APPEND_READ"           // [a+] Read anywhere, but writes only append, create if not exists
  | "EXCLUSIVE_WRITE"       // [wx] Write, fail if exists
  | "EXCLUSIVE_READ_WRITE"  // [wx+] Read + Write, fail if exists
  | "EXCLUSIVE_APPEND"      // [ax] Append, fail if exists
  | "EXCLUSIVE_APPEND_READ" // [ax+] Read + Append, fail if exists (rare use case, verify necessity);


export interface T_TLFDOpen {
    /** Reference to the volume containing the file. */ volumeRef: Volume
    /** Address of the head block. */                   headAddress: number
    /** AES volume encryption key. */                   aesKey: Buffer
    /** Open flag. */                                   flag: TOpenFlag
}

// Exports ========================================================================================

export default class TopLevelFileDescriptor {

    /** Reference to the volume instance used for accessing block I/O methods. */
    private declare volumeRef: Volume
    /** List of addresses of individual link blocks. */
    private declare links: number[]
    /** File's head block - Used for storing and updating file metadata during I/O. */
    private declare head: THeadBlock
    /** The last link block on the list - Used for append writes. */
    private declare tail: TLinkBlock
    /** Volume encryption key. */
    private declare AESKey: Buffer


    private constructor() {}


    /**
     * instantiates a top-level file descriptor (TLFD) which allows for manipulating
     * a file's head and link blocks and exposes methods for allocating new storage space.
     * @param open 
     * @returns 
     */
    public static async open(open: T_TLFDOpen): T.XEavA<TopLevelFileDescriptor, "L1_TLFD_OPEN"> {
        try {
            const self = new this()
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_TLFD_OPEN', null, error as Error)
        }
    }


}

