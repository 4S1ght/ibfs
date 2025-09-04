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

    test('VFS.canWriteNode', () => {

        vfs.tree.perms = { group1: 1, group2: 2 }
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
                perms: { group1: 2, group2: 0 },
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                    }
                }
            }
        }

        // Root directory
        expect(vfs.canWriteNode('/', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/', 'group2')).toBe(undefined)

        // File directly in root
        expect(vfs.canWriteNode('/file1.txt',    'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/not-existent', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/file1.txt',    'group2')).toBe(undefined)

        // Nested file
        expect(vfs.canWriteNode('/folder1/file2.txt', 'group1')).toBe(undefined)

        // Nested file with denied parent
        expect(vfs.canWriteNode('/folder1/file2.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

    })

    test('VFS.canMakeNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
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

        // Root directory
        expect(vfs.canMakeNode('/', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)
        expect(vfs.canMakeNode('/', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // File directly in root
        expect(vfs.canMakeNode('/item', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canMakeNode('/item', 'group2')).toBe(undefined)
        expect(vfs.canMakeNode('/item', 'group3')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Make file that already exists
        expect(vfs.canMakeNode('/file1.txt', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canMakeNode('/file1.txt', 'group2')!.has('L2_VFS_ALREADY_EXISTS')).toBe(true)

        // Make folder that already exists
        expect(vfs.canMakeNode('/folder1', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canMakeNode('/folder1', 'group2')!.has('L2_VFS_ALREADY_EXISTS')).toBe(true)

        // Nested file with denied parent
        expect(vfs.canMakeNode('/folder1/file3.txt', 'group2')).toBe(undefined)
        expect(vfs.canMakeNode('/folder1/file3.txt', 'group3')!.has('L2_VFS_NO_PERM')).toBe(true)


    })

    test('VFS.canManageNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
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
    
    test('VFS.canRenameNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
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

        // Rename root directory
        expect(vfs.canRenameNode('/', '/test', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canRenameNode('/', '/test', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // Rename direct child of a level-2 access directory
        expect(vfs.canRenameNode('/folder1/file2.txt', 'new-name', 'group1')).toBe(undefined)
        expect(vfs.canRenameNode('/folder1/file2.txt', 'new-name', 'group0')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Rename non-existent file
        expect(vfs.canRenameNode('/folder1/non-existent', 'new-name', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // Rename to an already taken name
        expect(vfs.canRenameNode('file1.txt', 'folder1', 'group2')!.has('L2_VFS_ALREADY_EXISTS')).toBe(true)
        
    })

    test('VFS.canMoveNode', () => {
        
    })

    test('VFS.canDeleteNode', () => {
        
    })
    
})
