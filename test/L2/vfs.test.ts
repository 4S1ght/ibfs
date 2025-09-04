import { describe, test, expect } from "vitest"
import IBFSError from "../../src/errors/IBFSError.js"
import VFS from "../../src/L2/VirtualFilesystem.js"
import { TPermLevel } from "../../src/L1/directory/DirectoryTables.js"

describe('Virtual Filesystem', () => {

    const vfs = new VFS()

    test('VFS.canReadNode', () => {

        vfs.tree.perms = { group1: 1 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: {},
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                    },
                    'folder2': {
                        type: 'DIR',
                        size: 0,
                        address: 40,
                        perms: { group1: 0 },
                        children: {
                            'file3.txt': {
                                type: 'FILE',
                                size: 300,
                                address: 50,
                            },
                            'folder3': {
                                type: 'DIR',
                                size: 0,
                                address: 60,
                                perms: { group1: 1 },
                                children: {}
                            }
                        },
                    },
                },
            },
        }

        // Root directory
        expect(vfs.canReadNode('/', 'group1')).toBe(undefined)
        expect(vfs.canReadNode('/', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // File directly in root
        expect(vfs.canReadNode('/file1.txt',    'group1')).toBe(undefined)
        expect(vfs.canReadNode('/not-existent', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)
        expect(vfs.canReadNode('/file1.txt',    'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested file
        expect(vfs.canReadNode('/folder1/file2.txt', 'group1')).toBe(undefined)
        expect(vfs.canReadNode('/folder1/file2.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested folder with denied permissions
        expect(vfs.canReadNode('/folder1/folder2/file3.txt', 'group1')).toBeInstanceOf(IBFSError)
        expect(vfs.canReadNode('/folder1/folder2/file3.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested folder whose parent has denied permissions
        expect(vfs.canReadNode('/folder1/folder2/folder3/', 'group1')).toBeInstanceOf(IBFSError)
        expect(vfs.canReadNode('/folder1/folder2/folder3/', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)
        
    })

    test('VFS.canManageNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0}
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 3, group3: 3 },
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                    }
                }
            },
        }

        // Manage root directory
        expect(vfs.canManageNode('/', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canManageNode('/', 'group2')).toBe(undefined)

        // Manage direct children of a level-3 directory
        expect(vfs.canManageNode('/folder1', 'group1')).toBe(undefined)
        expect(vfs.canManageNode('/folder1/file2.txt', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true) // Can't manage files, only directories

        expect(vfs.canManageNode('/folder1', 'group2')).toBe(undefined)

        // Manage directory while upper parent denies access
        expect(vfs.canManageNode('/folder1', 'group3')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canManageNode('/folder1/file2.txt', 'group3')!.has('L2_VFS_NO_PERM')).toBe(true)


    })
    
    
})
