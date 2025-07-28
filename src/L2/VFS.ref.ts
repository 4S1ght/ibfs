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
type TSafeNode = Omit<TNode, 'perms'|'children'>

export interface TSafeDirectory extends Omit<TDirectory, 'perms'|'children'> {
    /** Children files and subdirectories.            */ children: Record<string, TSafeNode>
}

// Method types --------------------------------------------------------------------------------------------------------

// Exports =============================================================================================================

export default class VFS {

    // Static ----------------------------------------------------------------------------------------------------------


    private static file(address: number, size = 0): TNode {
        return {
            type: 'FILE',
            size,
            address
        }
    }

    private static dir(address: number, size = 0): TNode {
        return {
            type: 'DIR',
            size,
            address,
            perms: {},
            children: {}
        }
    }

    private static toSafeDir(dir: TDirectory): TSafeDirectory {
        return {
            type: 'DIR',
            size: dir.size,
            address: dir.address,
            children: Object.fromEntries(Object.entries(dir.children).map(([nodeName, node]) => [nodeName, {
                type: node.type,
                size: node.size,
                address: node.address
            }]))
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
        if (parts.length === 1 && ['', '.', undefined].includes(parts[0]!)) return { parts: [], last: undefined }
        return {
            parts,
            last: parts.pop()
        }
    }

    private static createPermCascade(rootLevel?: TPermLevel) {
        let permLevel: TPermLevel = rootLevel || 0
        return {
            progress (newLevel?: TPermLevel) {
                if (permLevel === 4) return // Admin always has full permissions.
                if (permLevel === 3) return // Inherit same manage level all the way down directory tree.
                if (permLevel === 0) return // Inherit denied access if any parent denies it.
                if (!newLevel)       return // Inherit previous perm level if not overwritten.
                if (newLevel === 4)  return // Reassignment of admin (likely corrupted data) - Deny permission.
                permLevel === newLevel      // Freely swap between read/write permissions depending on directory depth & perms set.

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

    public readDirUnsafe(path: string, user?: string): T.XEav<{ node: TDirectory, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
        try {

            let current: TNode = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[user!])

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

    public $readDir(path: string, user: string): T.XEav<{ node: TSafeNode, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
        const [error, resolved] = this.readDirUnsafe(path, user)
        return error
            ? [error, null]
            : [null, { node: VFS.toSafeDir(resolved.node), perm: resolved.perm }]
    }

    public $makeDir(path: string, address: number, user?: string): T.XEav<TDirectory, 'L2_VFS_NO_PERM'|'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
        try {
            
            let current: TNode = this._vfs
            const { parts, last } = VFS.split(path)
            const perm = VFS.createPermCascade(this._vfs.perms[user!])

            for (let i = 0; i < parts.length; i++) {

                const part = parts[i]!
                const parent = i === parts.length - 1

                if (user && !perm.canRead)  return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
                if (!current)               return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, user })
                if (current.type !== 'DIR') return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, user })

                if (parent) {
                    if (current.children[last!]) return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" already exists.`, null, { path, user })
                    current.children[last!] = VFS.dir(address)
                }

            }

            return [null, current.children[last!] as TDirectory]

        } 
        catch (error) {
            return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })    
        }
    }

    // Refactor to use methods that do not modify the VFS cache in order to check permissions
    // during write operations:

    // Directories -----------------------------------------------------------------------------------------------------

    public canReadDir(path: string, user: string) {}
    public readDir   (path: string) {}

    public canMakeDir(path: string, user: string) {}
    public makeDir   (path: string, address: number) {}

    public canRenameDir(src: string, dst: string, user: string) {}
    public renameDir   (src: string, dst: string) {}

    public canDeleteDir(path: string, user: string) {}
    public deleteDir   (path: string) {}


}
