// Imports =============================================================================================================

import { normalize } from "node:path"

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

interface TSafeDIrectory extends Omit<TDirectory, 'children' | 'perms'> {
    /** Children files and subdirectories.            */ children:  string[]
}

interface TFile {
    /** Type of the file structure.                   */ type:      'FILE'
    /** Total size of the file's contents.            */ size:      number
    /** Physical address of the file head block.      */ address:   number
}

type TNode = TDirectory | TFile
type TSafeNode = TSafeDIrectory | TFile

// Method types --------------------------------------------------------------------------------------------------------

export interface TMakeDir {
    /** Physical address of the directory head block.       */ address:     number
    /** Whether to create parent directories recursively.   */ recursive?:  boolean
}

export interface TMakeFile {
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
                if (permLevel === 3) return                             // Admin always has full permissions
                if (newPerm === undefined) return                       // Inherit perm level if not overwritten
                permLevel = Math.min(newPerm, permLevel) as TPermLevel  // Inherit same level or drop it
            },
            get canRead() { return permLevel >= 1 },       
            get canWrite() { return permLevel >= 2 },
            get canManage() { return permLevel >= 3 },
            get permLevel() { return permLevel }
        }
    }

    private static toSafeNode(node: TNode): TSafeNode {
        return node.type === 'DIR' 
            ? {
                type: 'DIR',
                size: node.size,
                address: node.address,
                children: Object.keys(node.children)
            }
            :{
                type: 'FILE',
                size: node.size,
                address: node.address
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
     * **IMPORTANT - Skipping the `asUser` parameter disables permission checking! Only for internal use!**
     * @param path Standard file path. Eg. `/a/b/c`
     * @param asUser User making the request
     * @returns [Error?, Node?]
     */
    public resolvePathUnsafe(path: string, asUser?: string): T.XEav<{ node: TNode, perm: TPermLevel }, "L2_VFS_MISDIR"|'L2_VFS_NO_PERM'> {
        try {

            let current: TNode = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[asUser!] || 0)

            if (path === '/' || path === '') {
                if (perm.canRead) return [null, { node: current, perm: perm.permLevel }]
                return IBFSError.eav('L2_VFS_NO_PERM', null, null, x)
            }

            for (let i = 0; i < parts.length; i++) {
                
                const last = i === parts.length - 1
                const part = parts[i]!

                if (asUser && !perm.canRead)         return IBFSError.eav('L2_VFS_NO_PERM', null, null, x)
                if (!last && current.type !== 'DIR') return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path })
                if (!current.children[part])         return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path })
                
                current = current.children[part] as TDirectory
                perm.progress(current.perms[asUser!])

            }

            return [null, { node: current, perm: perm.permLevel }]
            
        } 
        catch (error) {
            return IBFSError.eav('L2_VFS_MISDIR', null, error as Error, { path })
        }
    }

    /**
     * Resolves the `path` to a node in the VFS.
     * @param path Standard file path. Eg. `/a/b/c`
     * @param asUser User making the request
     * @returns [Error?, Node?]
     */
    public resolvePath(path: string, asUser: string): T.XEav<{ node: TSafeNode, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
        if (!asUser) return IBFSError.eav('L2_VFS_NO_PERM', 'Undefined user ID passed to VFS.resolvePath(path, -> asUser <-)', null, x)
        const [error, resolved] = this.resolvePathUnsafe(path, asUser)
        return error
            ? [error, null]
            : [null, { node: VFS.toSafeNode(resolved.node), perm: resolved.perm }]
    }

    /**
     * Makes a new virtual directory.
     * @param path Path to the directory.
     * @param asUser User making the directory.
     * @param opt Make options
     */
    public mkDir(path: string, asUser: string, opt: TMakeDir): T.XEavS<'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
        try {

            let current: TDirectory = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[asUser] || 0)

            for (let i = 0; i < parts.length; i++) {

                const part = parts[i]!
                const last = i === parts.length - 1

                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, x)
                if (current.children[part] && current.children[part]?.type !== 'DIR') return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, ...x })

                if (opt.recursive) {
                    if (!current.children[part]) current.children[part] = VFS.dir(opt.address)
                }
                else {
                    if (current.children[part] == undefined && !last) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, ...x })
                    current.children[part] = VFS.dir(opt.address)
                }

                current = current.children[part] as TDirectory
                perm.progress(current.perms[asUser])

            }
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_MKDIR', null, error as Error, x)
        }
    }

    /**
     * Makes a new virtual directory.
     * @param path Path to the directory.
     * @param asUser User making the directory.
     * @param opt Make options
     */
    public mkFile(path: string, asUser: string, opt: TMakeFile): T.XEavS<'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
        try {
            
            let current: TDirectory = this._vfs
            const parts = VFS.normalizePath(path).split('/')
            const perm = VFS.createPermCascade(this._vfs.perms[asUser] || 0)

            for (let i = 0; i < parts.length; i++) {
                
                const part = parts[i]!
                const last = i === parts.length - 1

                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, ... x})
                if (current.children[part] && current.children[part]?.type !== 'DIR') return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, ...x })

                if (last) {
                    if (current.children[part]) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" already exists.`, null, { path, ...x })
                    current.children[part] = VFS.file(opt.address)
                }
                else {
                    if (current.children[part] == undefined) return new IBFSError('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, ...x })
                    current = current.children[part] as TDirectory
                    perm.progress(current.perms[asUser])
                }

            }

        } 
        catch (error) {
            return new IBFSError('L2_VFS_MKDIR', null, error as Error, { path })
        }
    }

    public rename(oldPath: string, newPath: string, asUser: string): T.XEavS<'L2_VFS_RENAME'|'L2_VFS_NO_PERM'> {
        try {

            oldPath = VFS.normalizePath(oldPath)
            newPath = VFS.normalizePath(newPath)

            if (oldPath === '' || newPath === '') return new IBFSError('L2_VFS_RENAME', `Can't rename form/to empty path`, null, { oldPath, newPath, ...x })

            const _oldPathParts = oldPath.split('/')
            const oldPathItem = _oldPathParts.pop()!
            const oldPathDir = _oldPathParts.join('/')
            
            const _newPathParts = newPath.split('/')
            const newPathItem = _newPathParts.pop()!
            const newPathDir = _newPathParts.join('/')

            const [err1, oldDir] = this.resolvePathUnsafe(oldPathDir, asUser)
            const [err2, newDir] = this.resolvePathUnsafe(newPathDir, asUser)

            if (err1 || err2) return new IBFSError('L2_VFS_RENAME', null, err1 || err2, { oldPath, newPath })

            if (oldDir.perm < 2) return new IBFSError('L2_VFS_NO_PERM', null, null, { oldPath, newPath, ...x })
            if (newDir.perm < 2) return new IBFSError('L2_VFS_NO_PERM', null, null, { oldPath, newPath, ...x })


        } 
        catch (error) {
            return new IBFSError('L2_VFS_RENAME', null, error as Error, { oldPath, newPath })
        }
    }

}


const x = new VFS()

console.log('\n\n')

console.log(x.mkDir('/test',     'user',  { address: 123 }))
console.log(x.mkDir('/test/a/b', 'user',  { address: 123, recursive: true }))
console.log(x.mkDir('/test/a/c', 'admin', { address: 123, recursive: true }))
console.log(x.mkFile('/test/a/d', 'user', { address: 123 }))
console.dir(x, { depth: null })

console.log('\n\n')

import fs from 'node:fs/promises'
fs.rename