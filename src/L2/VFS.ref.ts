// Imports =============================================================================================================

import type * as T from "../../types.js"
import type { TPermLevel } from "../L1/directory/DirectoryTables.js"

import { normalize } from "node:path"
import IBFSError from "../errors/IBFSError.js"

// Types ===============================================================================================================

// Base types ----------------------------------------------------------------------------------------------------------

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

// Method types --------------------------------------------------------------------------------------------------------

// Exports =============================================================================================================

export default class VFS {

    // Static ----------------------------------------------------------------------------------------------------------

    private static dir(address: number, size = 0): TNode {
        return {
            type: 'DIR',
            size,
            address,
            perms: {},
            children: {}
        }
    }

    private static file(address: number, size = 0): TNode {
        return {
            type: 'FILE',
            size,
            address
        }
    }

    private static normalizePath = (path: string): string => {
        path = normalize(path)
        if (path.endsWith('/')) path = path.slice(0, -1)
        if (path.startsWith('/')) path = path.slice(1)
        return path
    }

    private static split(path: string): { parts: string[], last: string | undefined } {

        const parts = this.normalizePath(path).split('/')

        if (parts.length === 1 && ['', '.', undefined].includes(parts[0]!)) {
            return { parts: [], last: undefined }
        }

        return {
            parts,
            last: parts.pop()
        }

    }

    private static createPermCascade(rootLevel: TPermLevel) {
        let permLevel = rootLevel
        return {
            progress (newLevel?: TPermLevel) {
                if (permLevel === 4) return // Admin always has full permissions
                if (permLevel === 3) return // Inherit same manage level all the way down directory tree
                if (permLevel === 0) return // Inherit denied access if any parent denies it.
                if (!newLevel)       return // Inherit perm level if not overwritten
                permLevel === newLevel      // Freely swap between read/write permissions depending on directory depth & perms set

            },
            get canRead()       { return permLevel >= 1 },       
            get canWrite()      { return permLevel >= 2 },
            get canManage()     { return permLevel >= 3 },
            get canAdminister() { return permLevel >= 4 },
            get permLevel()     { return permLevel }
        }
    }

    // Initial ---------------------------------------------------------------------------------------------------------

    private _vfs: TDirectory = {
        type: "DIR",
        size: 0,
        address: 0,
        perms: {},
        children: {}
    }
    // Methods ---------------------------------------------------------------------------------------------------------
    
    // IDEA
    // Create a standalone class/object "browser" that itself handles going down the directory tree
    // while checking permissions transparently.

    public readDirUnsafe(path: string, user?: string): T.XEav<{ node: TNode, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
        try {

            let current: TNode = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[user!] || 0)

            for (const part of parts) {

                if (user && !perm.canRead)   return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
                if (!current)                return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, user })
                if (current.type !== 'DIR')  return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, user })
                
                current = current.children[part] as TDirectory
                perm.progress(current.perms[user!])
            }
            
            return [null, { node: current, perm: perm.permLevel }]

        } 
        catch (error) {
            return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
        }
    }


}