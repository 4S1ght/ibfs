// Imports =============================================================================================================

import type * as T from '../../types.js'
import IBFSError from '../errors/IBFSError.js'
import FileHandle from '../L1/file/FileHandle.js'
import FileReadStream, { TFRSOptions } from '../L1/file/FileReadStream.js'
import Filesystem, { TFSInit, TFSOpenFile } from '../L1/Filesystem.js'
import ssc from '../misc/safeShallowCopy.js'
import VFS, { TDirectory } from './VirtualFilesystem.js'

// Types ===============================================================================================================

export interface TNSInit extends TFSInit {
    /** The group of root users allowed to manage the filesystem. */ rootGroup: string
}

// Base options --------------------------------------------------------------------------------------------------------

interface BaseReadOptions {
    /** Whether to perform data integrity checks during reads. */ integrity?: boolean
}

export interface TNSOpenOptions extends Omit<TFSOpenFile, 'fileAddress'> {}

export interface TNSReadOptions extends BaseReadOptions {
    /** Offset from start of the file to begin reading from. */ offset?: number
    /** Number of bytes to read from the offset.             */ length: number
}

export interface TNSReadFileOptions extends BaseReadOptions {}

export interface TNSOpenReadStreamOptions extends BaseReadOptions, TFRSOptions {
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

    public async open(path: string, group: string, options: TNSOpenOptions): T.XEavA<FileHandle, 'L2_NS_OPEN_FILE' | 'L2_NS_NO_PERM' | 'L2_NS_LOCKED'> {
        try {

            // TODO: Instead of returning a direct file handle, return a proxy that limits the number of times 
            // "close" can be called to a single successful call to prevent a single user from closing a 
            // read-only handle for another.

            const permCheckError = options.mode === 'r'
                ? this.vfs.canReadNode(path, group)
                : this.vfs.canWriteNode(path, group)

            if (permCheckError) return IBFSError.eav('L2_NS_OPEN_FILE', null, permCheckError, { path, group, options })

            const [resolveError, vfsNode] = this.vfs.resolve(path)
            if (resolveError) return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError, { path, group, options })

            const handle = vfsNode.lock && vfsNode.lock.deref()

            if (!handle) {

                const [openError, handle] = await this.fs.open({ fileAddress: vfsNode.address, ...options })
                if (openError) return IBFSError.eav('L2_NS_OPEN_FILE', null, openError, { path, group, options })

                vfsNode.lock = new WeakRef(handle)
                handle.on('close', () => vfsNode.lock = null)

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

    public async read(path: string, group: string, options: TNSReadOptions): T.XEavA<Buffer, 'L2_NS_READ'> {

        let fh: FileHandle | undefined = undefined

        try {

            const [openError, handle] = await this.open(path, group, { ...options, mode: 'r' })
            if (openError) return IBFSError.eav('L2_NS_READ', null, openError, { path, group, options })
            fh = handle

            const [readError, data] = await handle.read(options.offset || 0, options.length, options.integrity)
            if (readError) {
                await fh.close()
                return IBFSError.eav('L2_NS_READ', null, readError, { path, group, options })
            }

            const closeError = await handle.close()
            if (closeError) {
                await fh.close()
                return IBFSError.eav('L2_NS_READ', null, closeError, { path, group, options })
            }

            return [null, data]

        } 
        catch (error) {
            if (fh) await fh.close()
            return IBFSError.eav('L2_NS_READ', null, error as Error, { path, group, options })    
        }
    }

    public async readFile(path: string, group: string, options?: TNSReadFileOptions): T.XEavA<Buffer, 'L2_NS_READ_FILE'> {

        let fh: FileHandle | undefined = undefined

        try {

            const opt = options || {} 
            
            const [openError, handle] = await this.open(path, group, { ...options, mode: 'r' })
            if (openError) return IBFSError.eav('L2_NS_READ_FILE', null, openError, { path, group, options })
            fh = handle

            const [readError, data] = await handle.readFile(opt.integrity)
            if (readError) {
                await fh.close()
                return IBFSError.eav('L2_NS_READ_FILE', null, readError, { path, group, options })
            }

            const closeError = await handle.close()
            if (closeError) {
                await fh.close()
                return IBFSError.eav('L2_NS_READ_FILE', null, closeError, { path, group, options })
            }

            return [null, data]

        } 
        catch (error) {
            if (fh) await fh.close()
            return IBFSError.eav('L2_NS_READ_FILE', null, error as Error, { path, group, options })
        }
    }

    public async createReadStream(path: string, group: string, options?: TNSOpenReadStreamOptions): T.XEavA<FileReadStream, 'L2_NS_OPEN_READ_STREAM'> {

        let fh: FileHandle | undefined = undefined

        try {

            const [openError, handle] = await this.open(path, group, { ...options, mode: 'r' })
            if (openError) return IBFSError.eav('L2_NS_OPEN_READ_STREAM', null, openError, { path, group, options })
            fh = handle

            const [streamError, stream] = await handle.createReadStream(options)

            if (streamError) {
                await fh.close()
                return IBFSError.eav('L2_NS_OPEN_READ_STREAM', null, streamError, { path, group, options })
            }

            return [null, stream]

            
        } 
        catch (error) {
            if (fh) await fh.close()
            return IBFSError.eav('L2_NS_OPEN_READ_STREAM', null, error as Error, { path, group, options })
        }
    }



}