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

    private static createPermCascade(rootLevel?: TPermLevel) {
        let permLevel: TPermLevel = rootLevel || 0
        return {
            progress (newLevel?: TPermLevel | undefined) {
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
    
    // Initial state ---------------------------------------------------------------------------------------------------

    private _vfs: TDirectory = {
        type: 'DIR',
        size: 0,
        address: 0,
        perms: {},
        children: {}
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    /**
     * Checks if a new node can be created in the VFS.
     * @param path Path to the node to be created.
     * @param group Group that is creating the node.
     * @returns `undefined` if the node can be created, or an `IBFSError` if not.
     */
    public canMakeNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_ALREADY_EXISTS' | 'L2_VFS_CAN_MAKE_NODE'> {
        try {
        
            let current             = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!dest)         return new IBFSError('L2_VFS_BAD_PATH', `Can't create item on an empty path.`, null, { path, group })
            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            for (const part of parts) {
                
                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                    
                current = newCurrent
                
            }

            // After loop is finished, check if direct parent has write perms:
            if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                
            const newCurrent = current.children[dest]
            if (newCurrent) return new IBFSError('L2_VFS_ALREADY_EXISTS', `Entry "${dest}" in "${path}" already exists.`, null, { path, group })

            return undefined // Allow access

        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MAKE_NODE', null, error as Error, { path, group })
        }
    }

    /**
     * Checks if a node can be read in the VFS.
     * @param path Path to the node to be read.
     * @param group Group that is reading the node.
     * @returns `undefined` if the node can be read, or an `IBFSError` if not.
     */
    public canReadNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_READ_NODE'> {
        try {
            
            let current             = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!dest)         return new IBFSError('L2_VFS_BAD_PATH', `Can't read item on an empty path.`, null, { path, group })
            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            for (const part of parts) {

                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                    
                current = newCurrent

            }

            const newCurrent = current.children[dest]
            if (!newCurrent) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${dest}" in "${path}" does not exist.`, null, { path, group })

            // If reading a directory, don't just check read perms on the leading path like 
            // with files, but check read perms inside the target directory as well.
            if (newCurrent.type === 'DIR') {
                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            }

            return undefined // Allow access

        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_READ_NODE', null, error as Error, { path, group })
        }
    }

    /**
     * Checks if an existing node can be written to in the VFS.
     * @param path Path to the node to be written to.
     * @param group Group that is writing the node.
     * @returns `undefined` if the node can be written, or an `IBFSError` if not.
     */
    public canWriteNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_WRITE_NODE'> {
        try {
        
            let current             = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!dest)         return new IBFSError('L2_VFS_BAD_PATH', `Can't create item on an empty path.`, null, { path, group })
            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            for (const part of parts) {
                
                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                    
                current = newCurrent
                
            }

            // After loop is finished, check if direct parent has write perms:
            if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                
            const newCurrent = current.children[dest]
            if (!newCurrent) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${dest}" in "${path}" already exists.`, null, { path, group })

            // If writing a directory, don't just check read perms on the leading path like 
            // with files, but check read perms inside the target directory as well.
            if (newCurrent.type === 'DIR') {
                perm.progress(newCurrent.perms[group])
                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            }

            return undefined // Allow access

        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_WRITE_NODE', null, error as Error, { path, group })
        }
    }

    /**
     * Checks if a node can be renamed in the VFS on the specified `path` by a given `group`.
     * @param path Path to the node to be renamed.
     * @param newName The new name the node should have.
     * @param group Group that is renaming the node.
     * @returns `undefined` if the node can be renamed, or an `IBFSError` if not.
     */
    public canRenameNode(path: string, newName: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_RENAME_NODE' | 'L2_VFS_ALREADY_EXISTS'> {
        try {

            let current             = this._vfs
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!dest)         return new IBFSError('L2_VFS_BAD_PATH', `Can't rename item on an empty path.`, null, { path, group })
            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            for (const part of parts) {
                
                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                    
                current = newCurrent
                
            }

            // After loop is finished, check if direct parent has write perms:
            if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            // Check if source item exists
            const srcNamedItem = current.children[dest]
            if (!srcNamedItem) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${dest}" in "${path}" does not exist.`, null, { path, group })

            // Check if the target name isn't taken
            const destNamedItem = current.children[newName]
            if (destNamedItem) return new IBFSError('L2_VFS_ALREADY_EXISTS', `Entry "${newName}" in "${path}" already exists.`, null, { path, group })
            
            return undefined // Allow access
            
        }  
        catch (error) {
            return new IBFSError('L2_VFS_CAN_RENAME_NODE', null, error as Error, { path, group })    
        }
    }

    public canMoveNode(path: string, newParent: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_MOVE_NODE'> {
        try {

            let current = this._vfs

            // Source path ----------------------------------------------------

            const { parts: srcParts, dest: srcFinal } = VFS.normalizeAndSplit(path)
            const srcPerm                             = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!srcFinal) return new IBFSError('L2_VFS_BAD_PATH', `Can't move item on an empty path.`, null, { path, group })
            if (!srcPerm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            for (const part of srcParts) {

                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                srcPerm.progress(newCurrent.perms[group])
                if (!srcPerm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

                current = newCurrent
                
            }

            // After loop is finished, check if direct source parent has write perms:
            if (!srcPerm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            const sourceItem = current.children[srcFinal]
            if (!sourceItem) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${srcFinal}" in "${path}" doesn't exists.`, null, { path, group })

            // Destination path -----------------------------------------------

            current = this._vfs

            const { parts: destParts, dest: destFinal } = VFS.normalizeAndSplit(newParent)
            const destPerm                              = VFS.createPermCascade(this._vfs.perms[group] || 0)

            if (!destFinal) return new IBFSError('L2_VFS_BAD_PATH', `Can't move item on an empty path.`, null, { path, group })
            if (!destPerm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            for (const part of destParts) {

                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${newParent}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${newParent}" is not a directory.`, null, { path, group })

                destPerm.progress(newCurrent.perms[group])
                if (!destPerm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

                current = newCurrent
                
            }

            // After loop is finished, check if direct destination parent has write perms:
            if (!destPerm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            const destItem = current.children[destFinal]
            if (destItem) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${destFinal}" in "${newParent}" already exists.`, null, { path, group })

            return undefined            
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MOVE_NODE', null, error as Error, { path, group })    
        }
    }

    public canDeleteNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_DELETE_NODE'> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_DELETE_NODE', null, error as Error, { path, group })    
        }
    }

    public canManageNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_MANAGE_NODE'> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MANAGE_NODE', null, error as Error, { path, group })    
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