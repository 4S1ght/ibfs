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

interface SplitParts {
    parts: string[],
    dest: string | undefined
}

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

    private static normalizeAndSplit(path: string): SplitParts {
        const parts = VFS.normalizePath(path).split('/')
        if (parts.length === 1 && ['', '.', undefined].includes(parts[0]!)) return { parts: [], dest: undefined }
        return {
            parts,
            dest: parts.pop()
        }
    }

    private static createPermCascade(rootLevel?: TPermLevel) {
        let permLevel: TPermLevel = rootLevel || 0
        return {
            progress (newLevel?: TPermLevel) {
                if (permLevel === 4) return                 // Admin always has full permissions.
                if (permLevel === 3) return                 // Inherit same manage level all the way down directory tree.
                if (permLevel === 0) return                 // Inherit denied access if any parent denies it.
                if (!newLevel)       return                 // Inherit previous perm level if not overwritten.
                if (newLevel === 4)  return permLevel = 0   // Reassignment of admin (likely corrupted data) - Deny permission.
                permLevel = newLevel                        // Freely swap between read/write permissions depending on directory depth & perms set.
            },
            get canRead()       { return permLevel >= 1 },       
            get canWrite()      { return permLevel >= 2 },
            get canManage()     { return permLevel >= 3 },
            get isRoot()        { return permLevel >= 4 },
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
    
    // public readDirUnsafe(path: string, user?: string): T.XEav<{ node: TDirectory, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
    //     try {

    //         let current: TNode = this._vfs
    //         const parts = VFS.normalizePath(path).split('/')
    //         const perm = VFS.createPermCascade(this._vfs.perms[user!])

    //         for (const part of parts) {

    //             if (user && !perm.canRead)   return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
    //             if (!current)                return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, user })
    //             if (current.type !== 'DIR')  return IBFSError.eav('L2_VFS_MISDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, user })
                
    //             current = current.children[part] as TDirectory
    //             perm.progress(current.perms[user!])
    //         }
            
    //         return [null, { node: current, perm: perm.permLevel }]

    //     } 
    //     catch (error) {
    //         return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
    //     }
    // }

    // public $readDir(path: string, user: string): T.XEav<{ node: TSafeNode, perm: TPermLevel }, 'L2_VFS_MISDIR'|'L2_VFS_NO_PERM'> {
    //     const [error, resolved] = this.readDirUnsafe(path, user)
    //     return error
    //         ? [error, null]
    //         : [null, { node: VFS.toSafeDir(resolved.node), perm: resolved.perm }]
    // }

    // public $makeDir(path: string, address: number, user?: string): T.XEav<TDirectory, 'L2_VFS_NO_PERM'|'L2_VFS_MKDIR'|'L2_VFS_NO_PERM'> {
    //     try {
            
    //         let current: TNode = this._vfs
    //         const { parts, last } = VFS.split(path)
    //         const perm = VFS.createPermCascade(this._vfs.perms[user!])

    //         for (let i = 0; i < parts.length; i++) {

    //             const part = parts[i]!
    //             const parent = i === parts.length - 1

    //             if (user && !perm.canRead)  return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })
    //             if (!current)               return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" does not exist.`, null, { path, user })
    //             if (current.type !== 'DIR') return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" is not a directory.`, null, { path, user })

    //             if (parent) {
    //                 if (current.children[last!]) return IBFSError.eav('L2_VFS_MKDIR', `Entry "${part}" inside "${path}" already exists.`, null, { path, user })
    //                 current.children[last!] = VFS.dir(address)
    //             }

    //         }

    //         return [null, current.children[last!] as TDirectory]

    //     } 
    //     catch (error) {
    //         return IBFSError.eav('L2_VFS_NO_PERM', null, null, { path, user })    
    //     }
    // }

    // Directories -----------------------------------------------------------------------------------------------------

    /**
     * Takes in a path, a user ID and evaluates whether the user has permission to read the directory.
     * If the user doesn't have permission, an error is returned, if they do, the method returns `undefined`.  
     * A range of errors is possible depending on the path and the user ID.
     * @param path Resource path inside the filesystem.
     * @param user ID of the user requesting the operation.
     * @returns `IBFSError | undefined`
     */
    public canReadDir(path: string, user: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_READDIR'> {
        try {

            let current: TNode = this._vfs
            const parts        = VFS.normalizePath(path).split('/')
            const perm         = VFS.createPermCascade(this._vfs.perms[user])

            for (const part of parts) {

                if (!perm.canRead)          return new IBFSError('L2_VFS_NO_PERM',  null,                                               null, { path, user })
                if (!current)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, user })
                if (current.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, user })

                current = current.children[part] as TDirectory
                perm.progress(current.perms[user])

            }
            
            return undefined // Allow action

        } 
        catch (error) {
            return new IBFSError('L2_VFS_NO_PERM', null, error as Error, { path, user })
        }
    }

    /**
     * Takes a path, a user ID and evaluates whether the user has permission to create the directory.
     * If the user doesn't have permission, an error is returned, if they do, the method returns `undefined`.  
     * A range of errors is possible depending on the path and the user ID.
     * @param path Resource path inside the filesystem.
     * @param user ID of the user requesting the operation.
     * @returns `IBFSError | undefined`
     */
    public canMakeDir(path: string, user: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_MKDIR'> {
        try {
            
            let current: TNode      = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[user])

            if (!dest) return new IBFSError('L2_VFS_BAD_PATH', `Can't create directory in an empty path.`, null, { path, user })

            for (let i = 0; i < parts.length; i++) {

                const part = parts[i]!
                const last = i === parts.length - 1

                // Main path
                if (!perm.canRead)          return new IBFSError('L2_VFS_NO_PERM',  `No permission to read "${dest}" in "${path}".`,    null, { path, user })
                if (!current)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, user })
                if (current.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, user })

                // Main parent of the new directory
                if (last && !perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', `No permission to write to "${dest}" in "${path}".`, null, { path, user })

                current = current.children[part] as TDirectory
                perm.progress(current.perms[user])

            }

            if (current.children[dest]) return new IBFSError('L2_VFS_MKDIR', `Entry "${dest}" inside "${path}" already exists.`, null, { path, user })

            return undefined // Allow action

        } 
        catch (error) {
            return new IBFSError('L2_VFS_NO_PERM', null, error as Error, { path, user })
        }
    }

    public canRemoveDir(path: string, user: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_RMDIR' | 'L2_VFS_NOT_EMPTY'> {
        try {

            let current: TNode      = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[user])

            if (!dest) return new IBFSError('L2_VFS_BAD_PATH', `Can't delete the root directory.`, null, { path, user })

            // Leading path permissions ---------------------------------------

            for (let i = 0; i < parts.length; i++) {

                const part = parts[i]!
                const last = i === parts.length - 1

                // Main path
                if (!perm.canRead)          return new IBFSError('L2_VFS_NO_PERM',  `No permission to read "${dest}" in "${path}".`,    null, { path, user })
                if (!current)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, user })
                if (current.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, user })

                // Check if the user has write access in the target's parent directory.
                if (last && !perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', `No permission to write to "${dest}" in "${path}".`, null, { path, user })

            }

            const targetDir = current.children[dest]
            
            if (!targetDir)               return new IBFSError('L2_VFS_RMDIR', `Entry "${dest}" inside "${path}" does not exist.`,     null, { path, user })
            if (targetDir.type !== 'DIR') return new IBFSError('L2_VFS_RMDIR', `Entry "${dest}" inside "${path}" is not a directory.`, null, { path, user })
            
            perm.progress(targetDir.perms[user])

            if (!perm.canWrite)                             return new IBFSError('L2_VFS_NO_PERM',   `No permission to manage "${dest}" in "${path}".`, null, { path, user })
            if (Object.keys(targetDir.children).length > 0) return new IBFSError('L2_VFS_NOT_EMPTY', `Directory "${path}" is not empty.`,               null, { path, user })

            // Children permissions -------------------------------------------

            let deniedChild: string | null = null

            const scanChildrenPerms = (dir: TDirectory, pathChunks: string[] = []) => {
                for (const entry in dir.children) {
                    if (Object.prototype.hasOwnProperty.call(dir.children, entry)) {

                        const child = dir.children[entry]!
                        if (child.type !== 'DIR') continue

                        perm.progress(child.perms[user])
                        if (!perm.canWrite) {
                            if (!deniedChild) deniedChild = `${path}/${pathChunks.join('/')}/${entry}`
                            break
                        }

                        scanChildrenPerms(child, [...path, entry])

                    }
                }
            }

            scanChildrenPerms(targetDir)

            return perm.canWrite
                ? undefined // Allow action
                : new IBFSError('L2_VFS_NO_PERM', `Directory "${path}" can't be deleted because the user doesn't have write permissions in "${deniedChild}" and/or other subdirectories.`, null, { path, user })

        }
        catch (error) {
            return new IBFSError('L2_VFS_NO_PERM', null, error as Error, { path, user })
        }
    }


}