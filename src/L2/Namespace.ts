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

export interface TNSOpenOptions extends Omit<TFSOpenFile, 'fileAddress'> {
    /** Whether to create the file if it does not exist. */ create?: boolean
}

export interface TNSReadOptions extends BaseReadOptions {
    /** Offset from start of the file to begin reading from. */ offset?: number
    /** Number of bytes to read from the offset.             */ length: number
}

export interface TNSReadFileOptions       extends BaseReadOptions              {}
export interface TNSOpenReadStreamOptions extends BaseReadOptions, TFRSOptions {}

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

    /**
     * Wraps a file handle inside a proxy to provide limiting mechanisms on how many times certain methods
     * are allowed to be called by individual users. This is required because read-only handles are shared
     * across multiple users and without limiting, a single user could close the handle multiple times
     * causing it to close for other users that share it.
     */
    private createHandleProxy(handle: FileHandle): FileHandle {

        let closed = false
        let closing = false

        return new Proxy(handle, {

            get(target, prop, receiver) {

                if (closed) return new IBFSError('L2_FH_CLOSED', "The proxy to this handle has already been closed and can not be used.")

                if (prop === 'close') return async () => {

                    if (closing) return new IBFSError('L2_FH_CLOSING', "The proxy to this handle has already been closed and can not be used.")
                    if (closed) return new IBFSError('L2_FH_CLOSED', "The proxy to this handle has already been closed and can not be used.")
                    
                    closing = true

                    const closeError = target.close()
                    if (closeError) return closeError

                    closed = true
                    closing = false

                }
                
                const value = Reflect.get(target, prop, receiver)

                return typeof value === 'function'
                    ? value.bind(target)
                    : value
                    
            }

        })
    }

    /**
     * Opens the file on a specific `path` file and returns its handle. If the file is being used by another user that
     * conflicts with the action of opening a new handle, the call will fail and return an error. The same file can be
     * open multiple times by different users in read-only mode, but only by a single user in write mode which requires
     * absolute exclusive access.
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options - Append, truncate, etc.
     * @param options.mode The mode in which the file is being opened.
     * @param options.append Whether the file should be opened in append mode - Will force every write to the end of the file.
     * @param options.truncate Whether the file should be truncated to 0 bytes before opening it.
     * @param options.integrity Whether to perform data integrity checks.
     * @returns `[error, null] | [null, handle]`
     */
    public async open(path: string, group: string, options: TNSOpenOptions): T.XEavA<FileHandle, 'L2_NS_OPEN_FILE' | 'L2_NS_NO_PERM' | 'L2_NS_LOCKED'> {
        try {

            const permCheckError = options.mode === 'r'
                ? this.vfs.canReadNode(path, group)
                : this.vfs.canWriteNode(path, group)

            if (permCheckError) return IBFSError.eav('L2_NS_OPEN_FILE', null, permCheckError, { path, group, options })

            // File creation --------------------------------------------------

            const [resolveError, vfsNode] = this.vfs.resolve(path)

            if (resolveError) {
                if (options.create && resolveError.meta.missingDirect) {
                    
                    // TODO:
                    // 1. Namespace.open parent directory
                    // 2. Create empty file structure
                    // 3. Add it to the directory table and save the directory onto the disk.

                    return IBFSError.eav('L2_NS_OPEN_FILE', 'options.create not yet implemented', resolveError, { path, group, options })

                }
                else {
                    return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError, { path, group, options })
                }
            }


            if (resolveError) return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError, { path, group, options })

            // ----------------------------------------------------------------

            const handle = vfsNode.lock && vfsNode.lock.deref()

            // No existing handle, resource is free, open straight away and lock it.
            if (!handle) {

                const [openError, handle] = await this.fs.open({ fileAddress: vfsNode.address, ...options })
                if (openError) return IBFSError.eav('L2_NS_OPEN_FILE', null, openError, { path, group, options })

                vfsNode.lock = new WeakRef(handle)
                handle.on('close', () => vfsNode.lock = null)

                const proxy = this.createHandleProxy(handle)
                return [null, proxy]

            }
            // The resource is locked by another user.
            else {

                // Reuse/share a read-only handle (done internally)
                if (options.mode === 'r' && handle.mode === 'r') {

                    const [openError, handle] = await this.fs.open({ fileAddress: vfsNode.address, ...options })
                    if (openError) return IBFSError.eav('L2_NS_OPEN_FILE', null, openError, { path, group, options })

                    const proxy = this.createHandleProxy(handle)
                    return [null, proxy]

                }

                else return IBFSError.eav('L2_NS_LOCKED', null, null, { path, group, options })

            }
            
        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN_FILE', null, error as Error, { path, group, options })
        }
    }

    /**
     * Reads data from a specific place inside a file based on the `offset` and `length` parameters.  
     * **Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options.
     * @param options.offset The offset from the start of the file.
     * @param options.length The number of bytes to read.
     * @param options.integrity Whether to perform data integrity checks.
     * @returns `[error, null] | [null, Buffer]`
     */
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

    /**
     * Reads the entire contents of a file.  
     * **Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options.
     * @param options.integrity Whether to perform data integrity checks.
     * @returns `[error, null] | [null, Buffer]`
     */
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

    /**
     * Opens a file and returns a read stream.  
     * **Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options.
     * @param options.offset The offset from the start of the file to start reading from.
     * @param options.length The number of bytes to read.
     * @param options.maxChunkSize The maximum size of individual data chunks pushed to the stream.
     * @param options.highWaterMark The watermark below which the stream will read more data.
     * @param options.integrity Whether to perform data integrity checks.
     * @returns `[error, null] | [null, FileReadStream]`
     */
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