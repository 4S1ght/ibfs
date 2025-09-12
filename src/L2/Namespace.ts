// Imports =============================================================================================================

import type * as T from '../../types.js'
import IBFSError from '../errors/IBFSError.js'
import DirectoryTable from '../L1/directory/DirectoryTables.js'
import FileHandle from '../L1/file/FileHandle.js'
import Filesystem, { TFSInit, TFSOpenFile } from '../L1/Filesystem.js'
import ssc from '../misc/safeShallowCopy.js'
import VFS, { TDirectory } from './VirtualFilesystem.js'

// Types ===============================================================================================================

export interface TNSInit extends TFSInit {
    /** The group of root users allowed to manage the filesystem. */ rootGroup: string
}

// Exports =============================================================================================================

export default class Namespace {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    private declare fs: Filesystem
    private declare vfs: VFS

    // Factory ---------------------------------------------------------------------------------------------------------

    /**
     * Creates an empty IBFS filesystem and initializes it's namespace.
     */
    public static async createEmptyNamespace(options: TNSInit): T.XEavSA<'L2_NS_CREATE'> {
        try {
            
            // Create filesystem -----------------------------------------
            const createError = await Filesystem.createEmptyFilesystem(options)
            if (createError) return new IBFSError('L2_NS_CREATE', null, createError, ssc(options, ['aesKey']))

            // Create root group -----------------------------------------

            let vfs: TDirectory
            const [fsError, fs] = await Filesystem.open(options.fileLocation, options.aesKey, (dirTree) => vfs = dirTree as TDirectory)
            if (fsError) return new IBFSError('L2_NS_CREATE', null, fsError, ssc(options, ['aesKey']))

            const [openError, handle] = await fs.open({ fileAddress: vfs!.address, mode: 'rw' })
            if (openError) return new IBFSError('L2_NS_CREATE', null, openError, ssc(options, ['aesKey']))

            const writeError = await handle.writeAsDir({
                children: {},
                users: { [options.rootGroup]: 4 },
                meta: {}
            })
            if (writeError) return new IBFSError('L2_NS_CREATE', null, writeError, ssc(options, ['aesKey']))

            const hc = await handle.close()
            if (hc) return new IBFSError('L2_NS_CREATE', null, hc, ssc(options, ['aesKey']))

        } 
        catch (error) {
            return new IBFSError('L2_NS_CREATE', null, error as Error)
        }
    }

    // Lifecycle -------------------------------------------------------------------------------------------------------

    /**
     * Opens an IBFS volume and wraps it in a namespace allowing the user to 
     * interact with the underlying filesystem.
     */
    public static async open(image: string, aesKey: Buffer): T.XEavA<Namespace, 'L2_NS_OPEN'> {
        try {

            const self = new this()
            self.vfs = new VFS()

            const [fsError, fs] = await Filesystem.open(image, aesKey, (dirTree) => self.vfs.tree = dirTree as TDirectory)
            if (fsError) return IBFSError.eav('L2_NS_OPEN', null, fsError)
            self.fs = fs

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN', null, error as Error)
        }
    }

    // IO methods ------------------------------------------------------------------------------------------------------

    public async open(path: string, group: string, options: Omit<TFSOpenFile, 'fileAddress'>): T.XEavA<FileHandle, 'L2_NS_OPEN_FILE' | 'L2_NS_NO_PERM' | 'L2_NS_LOCKED'> {
        try {

            const isDisallowed = options.mode === 'r'
                ? this.vfs.canReadNode(path, group)
                : this.vfs.canWriteNode(path, group)

            if (isDisallowed) return IBFSError.eav('L2_NS_OPEN_FILE', null, isDisallowed, { path, group, options })

            const [resolveError, vfsNode] = this.vfs.resolve(path)
            if (resolveError) return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError, { path, group, options })

            const handle = vfsNode.lock && vfsNode.lock.deref()

            if (!handle) {

                const [openError, handle] = await this.fs.open({ fileAddress: vfsNode.address, ...options })
                if (openError) return IBFSError.eav('L2_NS_OPEN_FILE', null, openError, { path, group, options })

                vfsNode.lock = new WeakRef(handle)
                handle.on('final-close', () => vfsNode.lock = null)

                return [null, handle]

            }

            else {
                if (options.mode === 'r' && handle.mode === 'r') return [null, handle]
                else return IBFSError.eav('L2_NS_LOCKED', null, null, { path, group, options })
            }
            
        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN_FILE', null, error as Error, { path, group, options })
        }
    }

}