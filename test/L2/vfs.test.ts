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
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: {},
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    },
                    'folder2': {
                        type: 'DIR',
                        size: 0,
                        address: 40,
                        perms: { group1: 0 },
                        lock: null,
                        children: {
                            'file3.txt': {
                                type: 'FILE',
                                size: 300,
                                address: 50,
                                lock: null,
                            },
                            'folder3': {
                                type: 'DIR',
                                size: 0,
                                address: 60,
                                perms: { group1: 1 },
                                children: {},
                                lock: null,
                            }
                        },
                    },
                },
            },
            'locked-file': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: 'pending',
            }
        }

        // Root directory
        expect(vfs.canReadNode('/', 'group1')).toBe(undefined)
        expect(vfs.canReadNode('/', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // File directly in root
        expect(vfs.canReadNode('/file1.txt', 'group1')).toBe(undefined)
        expect(vfs.canReadNode('/not-existent', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)
        expect(vfs.canReadNode('/file1.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested file
        expect(vfs.canReadNode('/folder1/file2.txt', 'group1')).toBe(undefined)
        expect(vfs.canReadNode('/folder1/file2.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested folder with denied permissions
        expect(vfs.canReadNode('/folder1/folder2/file3.txt', 'group1')).toBeInstanceOf(IBFSError)
        expect(vfs.canReadNode('/folder1/folder2/file3.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Nested folder whose parent has denied permissions
        expect(vfs.canReadNode('/folder1/folder2/folder3/', 'group1')).toBeInstanceOf(IBFSError)
        expect(vfs.canReadNode('/folder1/folder2/folder3/', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Respect file locks
        expect(vfs.canReadNode('/locked-file', 'group1')!.has('L2_VFS_LOCKED')).toBe(true)

    })

    test('VFS.canWriteNode', () => {

        vfs.tree.perms = { group1: 1, group2: 2 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 2, group2: 0 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    }
                }
            },
            'locked-file': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: 'pending',
            }
        }

        // Root directory
        expect(vfs.canWriteNode('/', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/', 'group2')).toBe(undefined)

        // File directly in root
        expect(vfs.canWriteNode('/file1.txt', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/not-existent', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/file1.txt', 'group2')).toBe(undefined)

        // Nested file
        expect(vfs.canWriteNode('/folder1/file2.txt', 'group1')).toBe(undefined)

        // Nested file with denied parent
        expect(vfs.canWriteNode('/folder1/file2.txt', 'group2')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Respect file locks
        expect(vfs.canWriteNode('/locked-file', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canWriteNode('/locked-file', 'group2')!.has('L2_VFS_LOCKED')).toBe(true)

    })

    test('VFS.canMakeNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 3, group3: 3 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    }
                }
            },
            'folder2': {
                type: 'DIR',
                size: 0,
                address: 40,
                perms: {},
                lock: 'pending',
                children: {}
            }
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

        // Respect file locks
        expect(vfs.canMakeNode('/folder2/file.txt', 'group2')!.has('L2_VFS_LOCKED')).toBe(true)


    })

    test('VFS.canManageNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 3, group3: 3 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
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
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 3, group3: 3 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    }
                }
            },
            'locked-dir': {
                type: 'DIR',
                size: 1400,
                address: 10,
                lock: 'pending',
                perms: {},
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    }
                }
            }
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

        // Respect file locks
        expect(vfs.canRenameNode('/locked-dir/file2.txt', 'new-name', 'group2')!.has('L2_VFS_LOCKED')).toBe(true)

    })

    test('VFS.canMoveNode', () => {

        vfs.tree.perms = { group1: 1, group2: 4, group3: 0 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group1: 3 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    },
                    'file4.txt': {
                        type: 'FILE',
                        size: 400,
                        address: 60,
                        lock: null,
                    }
                }
            },
            'folder2': {
                type: 'DIR',
                size: 0,
                address: 40,
                perms: { group1: 1 },
                lock: null,
                children: {
                    'file3.txt': {
                        type: 'FILE',
                        size: 300,
                        address: 50,
                        lock: null,
                    },
                    'file4.txt': {
                        type: 'FILE',
                        size: 400,
                        address: 60,
                        lock: null,
                    }
                }
            },
            'locked-dir': {
                type: 'DIR',
                size: 1400,
                address: 10,
                lock: 'pending',
                perms: {},
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    }
                }
            },
        }

        // Move root directory
        expect(vfs.canMoveNode('/', '/test', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)
        expect(vfs.canMoveNode('/', '/test', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // Move item from write-enabled dir to a read-only dir
        expect(vfs.canMoveNode('/folder1/file2.txt', '/folder2', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canMoveNode('/folder1/file2.txt', '/folder2', 'group2')).toBe(undefined)

        // Move item from read-only dir to a write-enabled dir
        expect(vfs.canMoveNode('/folder2/file3.txt', '/folder1', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canMoveNode('/folder2/file3.txt', '/folder1', 'group2')).toBe(undefined)

        // Move item to a directory with an item of the same name
        expect(vfs.canMoveNode('/folder1/file4.txt', '/folder2', 'group2')!.has('L2_VFS_ALREADY_EXISTS')).toBe(true)

        // Respect file locks
        const op1 = vfs.canMoveNode('/file1.txt', '/locked-dir/', 'group2')!
        expect(op1.has('L2_VFS_LOCKED')).toBe(true)
        expect(op1.meta.lockPending).toBe(true)
        expect(op1.meta.lockedDir).toBe('dest')

        const op2 = vfs.canMoveNode('/locked-dir/file2.txt', '/folder2', 'group2')!
        expect(op2.has('L2_VFS_LOCKED')).toBe(true)
        expect(op2.meta.lockPending).toBe(true)
        expect(op2.meta.lockedDir).toBe('source')

    })

    test('VFS.canDeleteNode', () => {

        vfs.tree.perms = { group1: 1, group2: 2 }
        vfs.tree.children = {
            'file1.txt': {
                type: 'FILE',
                size: 1400,
                address: 10,
                lock: null,
            },
            'folder1': {
                type: 'DIR',
                size: 0,
                address: 20,
                perms: { group2: 2 },
                lock: null,
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: null,
                    },
                    'folder2': {
                        type: 'DIR',
                        size: 0,
                        address: 40,
                        perms: { group2: 1 },
                        children: {},
                        lock: null,
                    }
                }
            },
            'locked-dir': {
                type: 'DIR',
                size: 1400,
                address: 10,
                lock: null,
                perms: {},
                children: {
                    'file2.txt': {
                        type: 'FILE',
                        size: 5000,
                        address: 30,
                        lock: 'pending'
                    }
                }
            },
        }

        // Delete root directory
        expect(vfs.canDeleteNode('/', 'group1')!.has('L2_VFS_BAD_PATH')).toBe(true)
        expect(vfs.canDeleteNode('/', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // Delete existing item
        expect(vfs.canDeleteNode('/file1.txt', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canDeleteNode('/file1.txt', 'group2')).toBe(undefined)

        // Delete non-existent item
        expect(vfs.canDeleteNode('/non-existent', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)
        expect(vfs.canDeleteNode('/non-existent', 'group2')!.has('L2_VFS_BAD_PATH')).toBe(true)

        // Delete item in read-only dir
        expect(vfs.canDeleteNode('/folder1/file2.txt', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Delete read-only dir
        expect(vfs.canDeleteNode('/folder1', 'group1')!.has('L2_VFS_NO_PERM')).toBe(true)

        // Delete folder with children the user doesn't have write access to
        expect(vfs.canDeleteNode('/folder1', 'group2')!.has('L2_VFS_NO_PERM_NESTED')).toBe(true)

        // Respect file locks
        expect(vfs.canDeleteNode('/locked-dir/file2.txt', 'group2')!.has('L2_VFS_LOCKED')).toBe(true)
        expect(vfs.canDeleteNode('/locked-dir',           'group2')!.has('L2_VFS_LOCKED')).toBe(true)

    })

})
