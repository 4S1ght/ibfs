import { describe, test, expect } from "vitest"
import IBFSError from "../../src/errors/IBFSError.js"
import VFS from "../../src/L2/VirtualFilesystem.js"
import { TPermLevel } from "../../src/L1/directory/DirectoryTables.js"

describe('Virtual Filesystem', () => {

    const vfs = new VFS()

    const resetTree = (rootLevel: TPermLevel = 0) => {
        vfs.tree.perms = { group1: rootLevel }
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
    }

    

    test('VFS.canReadNode', () => {

        resetTree(1)

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
    
    
})
