// Imports =============================================================================================================

import { normalize } from "node:path"

import type * as T from "../../types.js"
import IBFSError from "../errors/IBFSError.ts"
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

// Method types --------------------------------------------------------------------------------------------------------

export interface TMakeDir {
    /** The user as which to perform the action.            */ asUser:      string
    /** Physical address of the directory head block.       */ address:     number
    /** Whether to create parent directories recursively.   */ recursive?:  boolean
}

export interface TMakeFile {
    /** The user as which to perform the action.            */ asUser:      string
    /** Physical address of the file head block.            */ address:     number
}

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

    private static createPermCascade(rootLevel: TPermLevel) {
        let permLevel = rootLevel
        return {
            progress: (newPerm?: TPermLevel) => {
                if (newPerm === undefined) return // Inherit perm level if not overwritten
                if (newPerm === 3) return         // Admin always has full permissions
                permLevel = Math.min(newPerm, permLevel) as TPermLevel
            },
            get canRead() { return permLevel >= 1 },       
            get canWrite() { return permLevel >= 2 },
            get canManage() { return permLevel >= 3 },
            get permLevel() { return permLevel }
        }
    }

    // Initial ---------------------------------------------------------------------------------------------------------

    private _vfs: TDirectory = {
        type: "DIR",
        size: 0,
        address: 0,
        perms: { admin: 3, user: 2, guest: 1},
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

            if (path === '/' || path === '') return [null, this._vfs]

            let current: TNode = this._vfs
            const parts = VFS.normalizePath(path).split('/')

            for (let i = 0; i < parts.length; i++) {
                
                const last = i === parts.length - 1
                const part = parts[i]!

                if (!last && current.type !== 'DIR') return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path })
                if (!current.children[part])         return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path })
                
                const child = current.children[part] as TDirectory
                current = child

            }

            return [null, current]
            
        } 
        catch (error) {
            return IBFSError.eav('L2_VFS_MISDIR', null, error as Error, { path })
        }
    }

    /**
     * Makes a new virtual directory.
     * @param path Path to the directory.
     * @param recursive Whether to create parent folders recursively.
     */
    public mkDir(path: string, x: TMakeDir): T.XEavS<'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
        try {

            let current: TDirectory = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[x.asUser] || 0)

            for (let i = 0; i < parts.length; i++) {

                const part = parts[i]!
                const last = i === parts.length - 1

                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, x)
                if (current.children[part] && current.children[part]?.type !== 'DIR') return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, ...x })

                if (x.recursive) {
                    if (!current.children[part]) current.children[part] = VFS.dir(x.address)
                }
                else {
                    if (current.children[part] == undefined && !last) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, ...x })
                    current.children[part] = VFS.dir(x.address)
                }

                current = current.children[part] as TDirectory
                perm.progress(current.perms[x.asUser])

            }
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_MKDIR', null, error as Error, x)
        }
    }

    public mkFile(path: string, x: TMakeFile): T.XEavS<'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
        try {
            
            let current: TDirectory = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[x.asUser] || 0)

            for (let i = 0; i < parts.length; i++) {
                
                const part = parts[i]!
                const last = i === parts.length - 1

                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, ...x})
                if (current.children[part] && current.children[part]?.type !== 'DIR') return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, ...x })

                if (last) {
                    if (current.children[part]) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" already exists.`, null, { path, ...x })
                    current.children[part] = VFS.file(x.address)
                }
                else {
                    if (current.children[part] == undefined) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, ...x })
                    current = current.children[part] as TDirectory
                    perm.progress(current.perms[x.asUser])
                }


            }

        } 
        catch (error) {
            return new IBFSError('L2_VFS_MKDIR', null, error as Error, { path })
        }
    }

}


const x = new VFS()

console.log('\n\n')

console.log(x.mkDir('/test',      { address: 123, asUser: 'user' }))
console.log(x.mkDir('/test/a/b',  { address: 123, recursive: true, asUser: 'user' }))
console.log(x.mkDir('/test/a/c',  { address: 123, recursive: true, asUser: 'admin' }))
console.log(x.mkFile('/test/a/d', { address: 123, size: 10, asUser: 'user' }))
console.dir(x, { depth: null })

console.log('\n\n')