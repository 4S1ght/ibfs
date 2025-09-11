// TODO: Add node locking support to VFS in order to reflect file handle locking.
// This also is required to properly perform recursive checks during deletion to
// to avoid deleting a parent directory of a currently open file.

// Imports =============================================================================================================

import type * as T from '../../types.js'
import type { TPermLevel  } from '../L1/directory/DirectoryTables.js'

import np from 'node:path'
import IBFSError from '../errors/IBFSError.js'

// Types ===============================================================================================================

export interface TDirectory {
    /** Type of the directory structure.              */ type:      'DIR'
    /** Total size of the directory's contents.       */ size:      number
    /** Physical address of the directory head block. */ address:   number
    /** User permissions inside the directory         */ perms:     Record<string, TPermLevel>
    /** Children files and subdirectories.            */ children:  Record<string, TNode>
}

export interface TFile {
    /** Type of the file structure.                   */ type:      'FILE'
    /** Total size of the file's contents.            */ size:      number
    /** Physical address of the file head block.      */ address:   Number
}

export type TNode = TDirectory | TFile

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

    public static file(address: number, size = 0): TNode {
        return {
            type: 'FILE',
            size,
            address
        }
    }

    public static dir(address: number, size = 0): TNode {
        return {
            type: 'DIR',
            size,
            address,
            perms: {},
            children: {}
        }
    }

    private static normalizePath(path: string): string{
        path = np.normalize(path)
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
                if (permLevel === 4)        return                  // Admin always has full permissions.
                if (permLevel === 3)        return                  // Inherit same manage level all the way down directory tree.
                if (permLevel === 0)        return                  // Inherit denied access if any parent denies it.
                if (newLevel === undefined) return                  // Inherit previous perm level if not overwritten.
                if (newLevel === 4)         return permLevel = 0    // Reassignment of admin (likely corrupted data) - Deny permission.
                permLevel = newLevel                                // Freely swap between read/write permissions depending on directory depth & perms set.
            },
            get canRead()       { return permLevel >= 1 },       
            get canWrite()      { return permLevel >= 2 },
            get canManage()     { return permLevel >= 3 },
            get isRoot()        { return permLevel >= 4 },
            get permLevel()     { return permLevel }
        }
    }
    
    // Initial state ---------------------------------------------------------------------------------------------------

    public tree: TDirectory = {
        type: 'DIR',
        size: 0,
        address: 0,
        perms: {},
        children: {}
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    /**
     * Resolves the path to a virtual node.
     * Use only for referencing VFS nodes for use in other private methods.
     * This function does not not perform access control checks.
     * @param path Path to the node to be resolved.
     * @returns [error, node]
     */
    public resolve(path: string): T.XEav<TNode, 'L2_VFS_BAD_PATH'> {

        let current: TNode = this.tree
        const parts = VFS.normalizePath(path).split('/')

        for (const part of parts) {
            const newCurrent = (current as TDirectory).children[part] as TNode | undefined
            if (!newCurrent) return IBFSError.eav('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`, null, { path })
            current = newCurrent
        }

        return [null, current]
    }

    /**
     * Checks if a new node can be created in the VFS.
     * @param path Path to the node to be created.
     * @param group Group that is creating the node.
     * @returns `undefined` if the node can be created, or an `IBFSError` if not.
     */
    public canMakeNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_ALREADY_EXISTS' | 'L2_VFS_CAN_MAKE_NODE'> {
        try {
        
            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })
            if (!dest)         return new IBFSError('L2_VFS_BAD_PATH', `Can't create item on an empty path.`, null, { path, group })

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
            
            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            if (!dest)         return undefined // No dest means empty path and a root directory as the target.

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
        
            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

            if (!dest) {
                if (perm.canWrite) return undefined // Allow writer users to write to the root directory.
                else               return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            }

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

            // If writing a directory, don't just check write perms on the leading path like 
            // with files, but check write perms inside the target directory as well.
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
     * @example
     * ```text
     * path    =  /path/to/ny/file.txt
     * newName =  newFile.txt
     * result  -> /path-to/my/newFile.txt
     * ```
     */
    public canRenameNode(path: string, newName: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_RENAME_NODE' | 'L2_VFS_ALREADY_EXISTS'> {
        try {

            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            
            if (!dest) {
                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                else                return new IBFSError('L2_VFS_BAD_PATH', `Can't rename root directory`, null, { path, group })
            }

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

    /**
     * Checks if a node can be moved from it's current parent directory to a new parent directory.
     * @param path Path to the node that's to be moved.
     * @param newParent Path to the direct parent to which the node should be moved.
     * @param group The group issuing the action.
     * @returns `undefined` if the node can be moved, or an `IBFSError` if not.
     * @example
     * ```text
     * path      =  /path/to/my/file.txt
     * newParent =  /new/path/
     * result    -> /new/path/file.txt
     * ```
     */
    public canMoveNode(path: string, newParent: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_MOVE_NODE' | 'L2_VFS_ALREADY_EXISTS'> {
        try {

            let current = this.tree

            // Source path ----------------------------------------------------

            const { parts: srcParts, dest: srcFinal } = VFS.normalizeAndSplit(path)
            const srcPerm                             = VFS.createPermCascade(this.tree.perms[group])

            if (!srcPerm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            if (!srcFinal) return new IBFSError('L2_VFS_BAD_PATH', `Can't move item on an empty path.`, null, { path, group })

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

            current = this.tree

            const { parts: destParts, dest: destFinal } = VFS.normalizeAndSplit(np.join(newParent, srcFinal))
            const destPerm                              = VFS.createPermCascade(this.tree.perms[group])

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
            if (destItem) return new IBFSError('L2_VFS_ALREADY_EXISTS', `Entry "${destFinal}" in "${newParent}" already exists.`, null, { path, group })

            return undefined            
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MOVE_NODE', null, error as Error, { path, group })    
        }
    }

    /**
     * Checks if a node can be deleted.
     * @param path Path to the node to be deleted.
     * @param group The group issuing the action.
     * @returns `undefined` if the node can be deleted, or an `IBFSError` if not.
     */
    public canDeleteNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_DELETE_NODE' | 'L2_VFS_NO_PERM_NESTED'> {
        try {

            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })
            if (!dest) return new IBFSError('L2_VFS_BAD_PATH', `Can't delete an empty path.`, null, { path, group })

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
            if (!newCurrent) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${dest}" in "${path}" doesn't exist.`, null, { path, group })

            // Perform extra nested checks if the deleted item is a directory.
            // Deleting a directory requires write perms to every subdirectory
            // and file recursively to avoid any partial operations.
            if (newCurrent.type === 'DIR') {

                perm.progress(newCurrent.perms[group])
                if (!perm.canWrite) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })

                let deniedChild: string | null = null

                const scanChildPerms = (dir: TDirectory, pathChunks: string[] = []) => {
                    for (const entry in dir.children) {
                        if (Object.prototype.hasOwnProperty.call(dir.children, entry)) {
                            
                            const child = dir.children[entry]!
                            if (child.type !== 'DIR') continue

                            perm.progress(child.perms[group])
                            if (!perm.canWrite) {
                                if (!deniedChild) deniedChild = pathChunks.join('/') 
                                break
                            }

                            scanChildPerms(child, [...pathChunks, entry])

                        }
                    }
                }

                scanChildPerms(newCurrent, [...parts, dest])

                if (deniedChild) return new IBFSError('L2_VFS_NO_PERM_NESTED', null, null, { path: deniedChild, group })

            }

            return undefined // Allow access
            
        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_DELETE_NODE', null, error as Error, { path, group })    
        }
    }

    /**
     * Checks if a node can be managed by a specific user group.
     * @param path Path to the node to be managed.
     * @param group Group that attempting to manage the node.
     * @returns `undefined` if the node can be managed, or an `IBFSError` if not.
     */
    public canManageNode(path: string, group: string): T.XEavS<'L2_VFS_BAD_PATH' | 'L2_VFS_NO_PERM' | 'L2_VFS_CAN_MANAGE_NODE'> {
        try {

            let current             = this.tree
            const { parts, dest }   = VFS.normalizeAndSplit(path)
            const perm              = VFS.createPermCascade(this.tree.perms[group])

            if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM',  null, null, { path, group })

            if (!dest) {
                if (perm.isRoot) return undefined // Allow root users to manage the root directory directly.
                else             return new IBFSError('L2_VFS_NO_PERM', `Can't manage the root directory as non-root.`, null, { path, group })
            }

            for (const part of parts) {
                
                const newCurrent = (current as TDirectory).children[part]

                if (!newCurrent)               return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" does not exist.`,     null, { path, group })
                if (newCurrent.type !== 'DIR') return new IBFSError('L2_VFS_BAD_PATH', `Entry "${part}" in "${path}" is not a directory.`, null, { path, group })

                perm.progress(newCurrent.perms[group])
                if (!perm.canRead) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                
                current = newCurrent

            }

            // // Check if the direct parent of the "dest" item gives the user manage permissions.
            // // Management level directories only allow management of their own children.
            // if (!perm.canManage) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
                
            const newCurrent = current.children[dest]
            if (!newCurrent) return new IBFSError('L2_VFS_BAD_PATH', `Entry "${dest}" in "${path}" doesn't exist.`, null, { path, group })
            
            if (newCurrent.type === 'DIR') {
                perm.progress(newCurrent.perms[group])
                if (!perm.canManage) return new IBFSError('L2_VFS_NO_PERM', null, null, { path, group })
            }
            else {
                return new IBFSError('L2_VFS_BAD_PATH', `Can not manage non-directories. (entry /${parts.join('/')}/<${dest}>)`, null, { path, group })
            }

            return undefined

        } 
        catch (error) {
            return new IBFSError('L2_VFS_CAN_MANAGE_NODE', null, error as Error, { path, group })
        }
    }

}