// Imports =============================================================================================================

import type * as T from "../../types.js"
import IBFSError from "../errors/IBFSError.js"
import type { TPermLevel } from "../L1/directory/DirectoryTables.js"

// Types ===============================================================================================================

interface TDirectory {
    /** Type of the directory structure.              */ type:      'DIR'
    /** Total size of the directory's contents.       */ size:      number
    /** Physical address of the directory head block. */ address:   number
    /** User permissions inside the directory         */ perms:     Record<string, TPermLevel>
    /** Children files and subdirectories.            */ children:  Record<string, TNode>
}

interface TFile {
    /** Type of the file structure.                   */ type:      'FILE'
    /** Total size of the file's contents.            */ size:      number
    /** Physical address of the file head block.      */ address:   number
}

type TNode = TDirectory | TFile

// Exports =============================================================================================================

export default class VFS {

    // Initial ---------------------------------------------------------------------------------------------------------

    private _vfs: TDirectory = {
        type: "DIR",
        size: 0,
        address: 0,
        perms: {},
        children: {}
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    /**
     * Resolves the `path` to a node in the VFS.
     * @param path Standard file path. Eg. `/a/b/c`
     * @returns [Error?, Node?]
     */
    public resolvePath(path: string): T.XEav<TNode, "L2_VFS_MISDIR"> {
        try {

            let current: TNode = this._vfs
            const parts = path.split('/')

            for (const part of parts) {
                if (part === '') continue
                if (current.type !== 'DIR') return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path })
                const child = current.children[part] as TNode
                current = child
            }

            return [null, current]
            
        } 
        catch (error) {
            return IBFSError.eav('L2_VFS_MISDIR', null, error as Error, { path })
        }
    }

}