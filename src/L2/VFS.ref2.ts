// Imports =============================================================================================================

import type * as T from '../../types.js'
import type { TPermLevel  } from '../L1/directory/DirectoryTables.js'

import { normalize } from 'node:path'
import IBFSError from '../errors/IBFSError.js'

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
    /** Physical address of the file head block.      */ address:   Number
}

type TNode = TDirectory | TFile

// Method types --------------------------------------------------------------------------------------------------------

interface SplitParts {
    parts: string[],
    dest: string | undefined
}

// Exports =============================================================================================================

/**
 * VFS is a class responsible for holding an in-memory copy of the directory tree meant to
 * speed up lookup times and enforcing access control based on user/group permissions.
 */
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

    private static normalizePath(path: string): string{
        path = normalize(path)
        if (path.endsWith('/')) path = path.slice(0, -1)
        if (path.startsWith('/')) path = path.slice(1)
        return path
    }

    private static normalizeAndSplit(path: string): SplitParts {

        const parts = VFS.normalizePath(path).split('/')
        const single = parts.length === 1 && ['', '.', undefined].includes(parts[0]!)

        if (single) return { parts: [], dest: undefined }
        else        return { parts, dest: parts.pop() }

    }

    // private static createPermCascade(rootLevel?: TPermLevel) {
    //     let permLevel: TPermLevel = rootLevel || 0
    //     return {
    //         progress (newLevel?: TPermLevel | undefined) {
    //             if (permLevel === 4) return                 // Admin always has full permissions.
    //             if (permLevel === 3) return                 // Inherit same manage level all the way down directory tree.
    //             if (permLevel === 0) return                 // Inherit denied access if any parent denies it.
    //             if (!newLevel)       return                 // Inherit previous perm level if not overwritten.
    //             if (newLevel === 4)  return permLevel = 0   // Reassignment of admin (likely corrupted data) - Deny permission.
    //             permLevel = newLevel                        // Freely swap between read/write permissions depending on directory depth & perms set.
    //         },
    //         get canRead()       { return permLevel >= 1 },       
    //         get canWrite()      { return permLevel >= 2 },
    //         get canManage()     { return permLevel >= 3 },
    //         get isRoot()        { return permLevel >= 4 },
    //         get permLevel()     { return permLevel }
    //     }
    // }

    private static createPathCascade(rootDir: TDirectory, group: string) {

        let currentNode: TNode | undefined = rootDir
        let permLevel: TPermLevel = currentNode.perms[group] || 0

        return {
            progress(childName: string) {

                // Previous node
                if (!currentNode) return
                if (currentNode.type === 'DIR') currentNode = currentNode.children[childName]

                // Next node
                if (currentNode && currentNode.type === 'DIR') {
                    const newLevel = currentNode.perms[group] || 0
                    if (permLevel === 4) return                 // Admin always has full permissions.
                    if (permLevel === 3) return                 // Inherit same manage level all the way down directory tree.
                    if (permLevel === 0) return                 // Inherit denied access if any parent denies it.
                    if (!newLevel)       return                 // Inherit previous perm level if not overwritten.
                    if (newLevel === 4)  return permLevel = 0   // Reassignment of admin (likely corrupted data) - Deny permission.
                    permLevel = newLevel                        // Freely swap between read/write permissions depending on directory depth & perms set.
                }

            },
            // Node
            get node()      { return currentNode    },
            // Node perms
            get canRead()   { return permLevel >= 1 },       
            get canWrite()  { return permLevel >= 2 },
            get canManage() { return permLevel >= 3 },
            get isRoot()    { return permLevel >= 4 },
            get permLevel() { return permLevel      }
        }

    }

    // Initial state ---------------------------------------------------------------------------------------------------

    private _vfs: TDirectory = {
        type: 'DIR',
        size: 0,
        address: 0,
        perms: {},
        children: {}
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    
    public canMakeFile_(path: string, group: string): T.XEavS<'L2_VFS_CAN_MAKE_FILE' | 'L2_VFS_ALREADY_EXISTS' | 'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM'> {
        try {

            let current: TNode | undefined    = this._vfs
            const { parts, dest } = VFS.normalizeAndSplit(path)
            const perm            = VFS.createPermCascade(this._vfs.perms[group] || 0)

            /* Empty path */ if (!dest) return new IBFSError('L2_VFS_BAD_PATH', `Can't create file in an empty path.`, null, { path, group })
            /* Root dir   */ if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            for (let i = 0; i < parts.length; i++) {
                
                const part = parts[i]!
                const last = i === parts.length - 1

                if (!perm.canRead)          return new IBFSError('L2_VFS_NO_PERM',  null,                                               null, { path, group })
                if (!current)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (current.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                // Direct parent of the new file
                if (last && !perm.canWrite) return new IBFSError('L2_VFS_NO_PERM',  null,                                               null, { path, group })

                current = current.children[part] as TDirectory
                perm.progress(current.perms[group])

            }

            const target = current.children[dest!]
            if (target) return new IBFSError('L2_VFS_ALREADY_EXISTS', `Entry "${dest}" in "${path}" already exists.`, null, { path, group })

            return undefined // Allow access
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MAKE_FILE', null, error as Error, { path, group })
        }
    }


    public canMakeFile(path: string, group: string): T.XEavS<'L2_VFS_CAN_MAKE_FILE' | 'L2_VFS_ALREADY_EXISTS' | 'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM'> {
        try {

            const cascade = VFS.createPathCascade(this._vfs, group)

            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MAKE_FILE', null, error as Error, { path, group })
        }
    }

    public canReadFile(path: string, group: string) {}
    public canWriteFile(path: string, group: string) {}
    public canRenameFile(path: string, group: string) {}
    public canMoveFile(path: string, group: string) {}
    public canDeleteFile(path: string, group: string) {}

    public canMakeDir(path: string, group: string) {}
    public canReadDir(path: string, group: string) {}
    public canWriteDir(path: string, group: string) {}
    public canRenameDir(path: string, group: string) {}
    public canMoveDir(path: string, group: string) {}
    public canDeleteDir(path: string, group: string) {}

}