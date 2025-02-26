// File Descriptor

// Imports =============================================================================================================

import type * as T from "../../../types.js"
import type { THeadBlock, TLinkBlock } from "../../L0/BlockSerialization.js"
import { new Set } from "../../misc/new Set.js"

import IBFSError    from "../../errors/IBFSError.js"
import Volume       from "../../L0/Volume.js"

// Types ===============================================================================================================

// r   |  Read-only, must exist
// r+  |  Read + Write, must exist
// w   |  Write, truncate if exists, create if not
// w+  |  Read + Write, truncate if exists, create if not
// a   |  Write, always append, create if not exists
// a+  |  Read anywhere, but writes only append, create if not exists
// wx  |  Write, fail if exists
// wx+ |  Read + Write, fail if exists
// ax  |  Append, fail if exists
// ax+ |  Read + Append, fail if exists
type TFileOpenFlag = 'r' | 'r+' | 'w' | 'w+' | 'a' | 'a+' | 'wx' | 'wx+' | 'ax' | 'ax+'
type TFileOpenMode = 'read' | 'write' | 'required' | 'exclusive' | 'trunc' | 'append'
type TFileModeLookup = Set<TFileOpenMode>

export interface TFHOpenOptions {
    /** Reference to the volume containing the file. */ volumeRef:   Volume
    /** Address of the head block.                   */ headAddress: number
    /** AES volume encryption key.                   */ aesKey:      Buffer
    /** Open flag.                                   */ flag:        TFileOpenFlag
}

// Exports =============================================================================================================

export default class FileHandle {

    // Modes:
    // * read       - Allow reads
    // * write      - Allow writes
    // * required   - File MUST already exist, fail if it doesn't. 
    // * exclusive  - File must NOT exist, fail if it does, create a new one if it doesn't.
    // * append     - (modifies "write") All write operations can only append to the end of the file.
    // * trunc      - Truncate the file if it exists.
    public static openModes: Record<TFileOpenFlag, Record<TFileOpenMode, boolean>> = {
        'r':    new Set([ 'read',          'required'            ]),
        'r+':   new Set([ 'read', 'write', 'required'            ]),
        'w':    new Set([         'write', 'trunc'               ]),
        'w+':   new Set([ 'read', 'write', 'trunc'               ]),
        'a':    new Set([         'write',              'append' ]),
        'a+':   new Set([ 'read', 'write',              'append' ]),
        'wx':   new Set([         'write', 'exclusive'           ]),
        'wx+':  new Set([ 'read', 'write', 'exclusive',          ]),
        'ax':   new Set([         'write', 'exclusive', 'append' ]),
        'ax+':  new Set([ 'read', 'write', 'exclusive', 'append' ]),
    }

    // Initial ---------------------------------------------------------------------------------------------------------

    /** Reference to the live volume containing the file.   */ private declare volumeRef:   Volume
    /** Address of the starting head block.                 */ private declare headAddress: number
    /** Volume encryption key.                              */ private declare aesKey:      Buffer
    /** Open flag.                                          */ private declare flag:        TFileOpenFlag
    /** Open mode.                                          */ private declare mode:        TFileModeLookup

    private constructor() {}

    public static async open(options: TFHOpenOptions): T.XEavA<FileHandle, "L1_FH_OPEN"> {
        try {

            const self = new this()

            self.volumeRef   = options.volumeRef
            self.headAddress = options.headAddress
            self.aesKey      = options.aesKey
            self.flag        = options.flag
            self.mode        = FileHandle.openModes[options.flag]

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_OPEN', null, error as Error)
        }
    }
    
}