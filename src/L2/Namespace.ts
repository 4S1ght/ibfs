// TODO: Add an operation-level queue similar to the block I/O queue, where each operation must wait its turn to prevent
// subtle race conditions when an operation has to lock more than a single file at a time.
//
// Also - Make the queue skippable, so that the "open" method can use the queue by default, but other higher-level
// operations can skip the queue when they need to open multiple files at once, effectively grouping multiple "opens"
// as a single queue operation.

// Imports =============================================================================================================

import type * as T from '../../types.js'

import IBFSError                                from '../errors/IBFSError.js'
import FileHandle                               from '../L1/file/FileHandle.js'
import FileReadStream, { TFRSOptions }          from '../L1/file/FileReadStream.js'
import FileWriteStream, { TFWSOptions }         from '../L1/file/FileWriteStream.js'
import Filesystem, { TFSInit, TFSOpenFile }     from '../L1/Filesystem.js'
import createRotaryID from '../misc/rotaryID.js'

import ssc                                      from '../misc/safeShallowCopy.js'
import VFS, { TDirectory, TNode }               from './VirtualFilesystem.js'

import np                                       from 'node:path'

// Types ===============================================================================================================

export interface TNSInit extends TFSInit {
    /** The group of root users allowed to manage the filesystem. */ rootGroup: string
}

// Base options --------------------------------------------------------------------------------------------------------

interface TBaseOpenOptions {
    /** How many times to retry opening the file if it fails due to a pending lock elsewhere. @default 3 */ 
    retry?: number
    /** How many milliseconds to wait between retries. @default 300 */
    retryDelay?: number
}

interface TBaseReadOptions {
    /** Whether to perform data integrity checks during reads. */ integrity?: boolean
}

export interface TNSOpenOptions extends TBaseOpenOptions, Omit<TFSOpenFile, 'fileAddress' | 'mode'> {
    /** Whether to create the file if it does not exist. */
    create?: boolean
    /** Mode in which to open the file. @default 'r' */ 
    mode?: 'r' | 'rw' | 'w'
    /** 
     * **Private API**  
     * Used internally to track recursive actions.
     */ 
    _rdID?: number
}

export interface TNSReadFileOptions       extends TBaseOpenOptions, TBaseReadOptions              {}
export interface TNSOpenReadStreamOptions extends TBaseOpenOptions, TBaseReadOptions, TFRSOptions {}

export interface TNSWriteFileOptions extends TBaseOpenOptions {
    /**  Whether to create the file if it does not exist. @default true */ 
    create?: boolean
}

export interface TNSOpenWriteStreamOptions extends TBaseOpenOptions, TFWSOptions, Pick<TFSOpenFile, 'append' | 'truncate'> {
    /**  Whether to create the file if it does not exist. @default true */ 
    create?: boolean
}

// Exports =============================================================================================================

export default class Namespace {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    private declare fs: Filesystem
    private declare vfs: VFS

    private rdg = createRotaryID(2**10)

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
     * Opens the file on a specific `path` and returns its handle. If the file is being used by another user in a way that
     * conflicts with the action of opening a new handle, the call will fail and return an error. The same file can be
     * open multiple times by different users in read-only mode, but only by a single user in write mode which requires
     * absolute exclusive access.
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options - Append, truncate, etc.
     * @param options.mode The mode in which the file is being opened. @default 'r'
     * @param options.append Whether the file should be opened in append mode - Will force every write to the end of the file. @default false
     * @param options.create Whether the file should be created if it does not exist. @default true // Only applies in write-enabled modes
     * @param options.truncate Whether the file should be truncated to 0 bytes before opening it. @default false // Only applies in write-enabled modes
     * @param options.integrity Whether to perform data integrity checks. @default true // Only applies in read-enabled modes
     * @param options.retry How many times to retry opening the file if it fails due to a pending lock from another user. Very rare this will be needed. @default 3
     * @param options.retryDelay How many milliseconds to wait between retries. @default 100
     * @returns `[error, null] | [null, handle]`
     */
    public async open(path: string, group: string, options: TNSOpenOptions = {}): T.XEavA<FileHandle, 'L2_NS_OPEN_FILE' | 'L2_NS_NO_PERM' | 'L2_NS_LOCKED', { lockPending?: true }> {
        try {

            const maxRetries = options.retry || 3
            const retryDelay = options.retryDelay || 100
            const mode = options.mode || 'r'

            const open = async (count: number = 0): Promise<ReturnType<typeof this.open>> => {

                const accessError = mode === 'r'
                    ? this.vfs.canReadNode(path, group)
                    : this.vfs.canWriteNode(path, group, options._rdID)

                // File creation ---------------------------------------------

                if (accessError) {

                    if (accessError.code === 'L2_VFS_LOCKED') {
                        // Retry X times if opening in read mode and file lock is pending,
                        // as it may be open elsewhere in read-only mode and it's worth waiting
                        // for the lock to clear or become a handle reference to be reused.
                        if (mode === 'r' && accessError.meta.lockPending && count < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, retryDelay))
                            return await open(count + 1)
                        }
                        return IBFSError.eav('L2_NS_LOCKED', null, accessError, { lockPending: true })
                    }

                    if (accessError.code === 'L2_VFS_BAD_PATH' && Object.hasOwn(accessError.meta, 'missingTarget') && options.create && mode !== 'r') {

                        const cantMake = this.vfs.canMakeNode(path, group)
                        if (cantMake) return IBFSError.eav('L2_NS_OPEN_FILE', null, cantMake)
                        
                        const [createError, fileHandle] = await this.createEmptyNode(path, group, 'FILE', true)
                        if (createError) return IBFSError.eav('L2_NS_OPEN_FILE', null, createError)
                        
                        const [resolveError, fileNode] = this.vfs.resolve(path)
                        if (resolveError) {
                            await fileHandle.close()
                            return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError)
                        }

                        fileNode.lock = new WeakRef(fileHandle)
                        fileHandle.on('close', () => fileNode.lock = null)

                        const proxy = this.createHandleProxy(fileHandle)
                        return [null, proxy]

                    }
                    else return IBFSError.eav('L2_NS_OPEN_FILE', null, accessError)

                }

                // -----------------------------------------------------------

                const [resolveError, vfsNode] = this.vfs.resolve(path)
                if (resolveError) return IBFSError.eav('L2_NS_OPEN_FILE', null, resolveError)

                const handle = vfsNode.lock && vfsNode.lock !== 'pending' && vfsNode.lock.deref()
                const fileAddress = vfsNode.address

                // No existing handle, resource is free, open straight away and lock it.
                if (!handle) {

                    vfsNode.lock = 'pending'

                    const [openError, handle] = await this.fs.open({ fileAddress, mode, ...options })
                    if (openError) {
                        vfsNode.lock = null
                        return IBFSError.eav('L2_NS_OPEN_FILE', null, openError)
                    }

                    vfsNode.lock = new WeakRef(handle)
                    handle.on('close', () => vfsNode.lock = null)

                    const proxy = this.createHandleProxy(handle)
                    return [null, proxy]

                }
                // The resource is locked by another user.
                else {

                    // Reuse/share a read-only handle if one exists (done internally)
                    if (mode === 'r' && handle.mode === 'r') {

                        const [openError, handle] = await this.fs.open({ fileAddress, mode, ...options })
                        if (openError) return IBFSError.eav('L2_NS_OPEN_FILE', null, openError)

                        const proxy = this.createHandleProxy(handle)
                        return [null, proxy]

                    }
                    // Return an error if the file is locked by another user in write mode.
                    else return IBFSError.eav('L2_NS_LOCKED', null, null)

                }

            }

            return await open()
            
        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN_FILE', null, error as Error)
        }
    }

    /**
     * Reads the entire contents of a file.  
     * **NOTE: Access limitations & locking apply. See `Namespace.open()` method.**
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
     * **NOTE: Access limitations & locking apply. See `Namespace.open()` method.**
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

            this.onStreamEnd(stream, () => fh?.close())

            return [null, stream]

            
        } 
        catch (error) {
            if (fh) await fh.close()
            return IBFSError.eav('L2_NS_OPEN_READ_STREAM', null, error as Error, { path, group, options })
        }
    }

    /**
     * Writes the entirety of the `data` buffer to the file on the specified `path`.  
     * This overwrites the entire file. For partial writes, use the `FileHandle` interface.  
     * **NOTE: Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param group Group that is requesting access to the resource - used to check access permissions.
     * @param data Data to write.
     * @param options Write options
     * @param options.create Whether to create the file if it does not exist. @default true
     * @returns `error | undefined`
     */
    public async writeFile(path: string, group: string, data: Buffer, options?: TNSWriteFileOptions): T.XEavSA<'L2_NS_WRITE_FILE'> {

        let fh: FileHandle | undefined = undefined

        const abort = async (cause: Error) => {
            await fh?.close()
            return new IBFSError('L2_NS_WRITE_FILE', null, cause, { path, group, options })
        }

        try {

            const opt = {
                create: true,
                ...options
            }

            const [openError, handle] = await this.open(path, group, { ...opt, mode: 'w' })
            if (openError) return await abort(openError)
            fh = handle

            const writeError = await handle.writeFile(data)
            if (writeError) return await abort(writeError)

            const closeError = await handle.close()
            if (closeError) return await abort(closeError)
            
        } 
        catch (error) {
            return await abort(error as Error)
        }
    }

    /**
     * Opens a file and returns a write stream.  
     * **NOTE: Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @param options Open options.
     * @param options.offset The offset from the start of the file to start writing to. @default 0 // - "append" option takes precedence if set.
     * @param options.highWaterMark The watermark below which the stream will write more data. @default 65536 // 64kB
     * @param options.append Whether to append all writes to the end of the file. @default false
     * @param options.create Whether to create the file if it does not exist. @default true
     * @param options.truncate Whether to truncate the file if it already exists. @default false
     * @returns `[error, null] | [null, FileWriteStream]`
     */
    public async createWriteStream(path: string, group: string, options?: TNSOpenWriteStreamOptions): T.XEavA<FileWriteStream, 'L2_NS_OPEN_WRITE_STREAM'> {
        
        let fh: FileHandle | undefined = undefined
        
        try {

            const opt = {
                create: true,
                ...options
            }

            const [openError, handle] = await this.open(path, group, { ...opt, mode: 'w' })
            if (openError) return IBFSError.eav('L2_NS_OPEN_WRITE_STREAM', null, openError, { path, group, options })
            fh = handle

            const [streamError, stream] = await handle.createWriteStream(opt)

            if (streamError) {
                await fh.close()
                return IBFSError.eav('L2_NS_OPEN_WRITE_STREAM', null, streamError, { path, group, options })
            }

            this.onStreamEnd(stream, () => fh?.close())

            return [null, stream]
            
        } 
        catch (error) {
            if (fh) await fh.close()
            return IBFSError.eav('L2_NS_OPEN_WRITE_STREAM', null, error as Error, { path, group, options })
        }
    }

    /**
     * Renames a file or directory. 
     * Unlike native `fs.rename()`, this method only takes a single path to the resource and a singular
     * new name. It can not be used to move resources around the filesystem.
     * **NOTE: Access limitations & locking apply. See `Namespace.open()` method.**
     * @param path Path to the resource in the filesystem.
     * @param newName The new name of the file/directory.
     * @param group The group that is requesting access to the resource - used to check access permissions.
     * @returns `error | undefined`
     */
    public async rename(path: string, newName: string, group: string): T.XEavSA<'L2_NS_RENAME' | 'L2_NS_BAD_NAME'> {

        const dirname = np.dirname(path)
        const basename = np.basename(path)

        let fh: FileHandle | undefined = undefined
        let pd: TDirectory

        if (newName.includes('/')) return new IBFSError('L2_NS_BAD_NAME', null, null, { path, newName, group })

        const abort = async (cause: Error) => {
            // Close handle
            if (fh) await fh.close()
            // Revert VFS changes
            if (pd && pd.children[newName]) {
                pd.children[basename] = pd.children[newName]
                delete pd.children[newName]
            }
            return new IBFSError('L2_NS_RENAME', null, cause, { path, newName, group })
        }

        try {

            const cantRename = this.vfs.canRenameNode(path, newName, group)
            if (cantRename) return await abort(cantRename);

            const [resolveError, parentDir] = this.vfs.resolveParent(path)
            if (resolveError) return await abort(resolveError)
            pd = parentDir

            const [openError, parentHandle] = await this.open(dirname, group, { mode: 'rw' })
            if (openError) return await abort(openError)
            fh = parentHandle

            const [readError, dirData] = await parentHandle.readAsDir()
            if (readError) return await abort(readError)

            dirData.children[newName] = dirData.children[basename]!
            delete dirData.children[basename]

            const writeError = await parentHandle.writeAsDir(dirData)
            if (writeError) return await abort(writeError)

            parentDir.children[newName] = parentDir.children[basename]!
            delete parentDir.children[basename]

            const closeError = await parentHandle.close()
            if (closeError) return await abort(closeError)
            
        } 
        catch (error) {
            return new IBFSError('L2_NS_RENAME', null, error as Error, { path, newName, group })
        }
    }

    public async move(path: string, newParent: string, group: string): T.XEavSA<'L2_NS_MOVE'> {

        const dirname = np.dirname(path)
        const basename = np.basename(path)

        let sfh: FileHandle | undefined = undefined // Source directory
        let dfh: FileHandle | undefined = undefined // Destination directory
        let pd: TDirectory                          // Parent directory
        let dd: TDirectory                          // Destination directory

        const abort = async (cause: Error) => {
            // Close handles
            if (sfh) await sfh.close()
            if (dfh) await dfh.close()
            // Revert VFS changes
            if (pd) {
                pd.children[basename] = dd.children[basename]!
                delete dd.children[basename]
            }
            // todo
            return new IBFSError('L2_NS_MOVE', null, cause, { path, newParent, group })
        }

        try {

            const cantMove = this.vfs.canMoveNode(path, newParent, group)
            if (cantMove) return await abort(cantMove)

            const [resolveError1, parentDir] = this.vfs.resolveParent(path)
            const [resolveError2, destDir]   = this.vfs.resolve(newParent)
            if (resolveError1 || resolveError2) return await abort(resolveError1! || resolveError2!)
            pd = parentDir as TDirectory
            dd = destDir as TDirectory

            const [o1, o2] = await Promise.all([
                this.open(dirname, group, { mode: 'rw' }),
                this.open(newParent, group, { mode: 'rw' })
            ])

            const [openError1, parentHandle] = o1
            if (openError1) return await abort(openError1)
            sfh = parentHandle

            const [openError2, destHandle] = o2
            if (openError2) return await abort(openError2)
            dfh = destHandle

            const [readError1, sourceDirData]   = await parentHandle.readAsDir()
            const [readError2, destDirData]     = await destHandle.readAsDir()
            if (readError1 || readError2) return await abort(readError1! || readError2!)

            destDirData.children[basename] = sourceDirData.children[basename]!
            delete sourceDirData.children[basename]

            const writeError1 = await parentHandle.writeAsDir(sourceDirData)
            if (writeError1) return await abort(writeError1)

            const writeError2 = await destHandle.writeAsDir(destDirData)
            if (writeError2) {
                // Attempt to revert on-disk changes from the parent.
                sourceDirData.children[basename] = destDirData.children[basename]!
                await parentHandle.writeAsDir(sourceDirData)
                return await abort(writeError2)
            }

            dd.children[basename] = pd.children[basename]!
            delete pd.children[basename]

            const [closeError1, closeError2] = await Promise.all([ sfh.close(), dfh.close() ])
            if (closeError1 || closeError2) return await abort(closeError1! || closeError2!)
        
        } 
        catch (error) {
            return new IBFSError('L2_NS_MOVE', null, error as Error, { path, group })    
        }
    }

    public async delete(path: string, group: string, recursive?: boolean): T.XEavSA<'L2_NS_DELETE'> {
        try {

            const dirname = np.dirname(path)
            const basename = np.basename(path)

            const cantDelete = this.vfs.canDeleteNode(path, group, recursive)
            if (cantDelete) return new IBFSError('L2_NS_DELETE', null, cantDelete, { path, group, recursive })

            const [parentError, parent] = this.vfs.resolveParent(path)
            const [childError, child]   = this.vfs.resolve(path)
            if (parentError || childError) return new IBFSError('L2_NS_DELETE', null, parentError || childError, { path, group, recursive })

            if (child.type === 'FILE') {

                const abort = (reason: Error) => {
                    if (cfh) cfh.close()
                    if (pfh) pfh.close()
                    return new IBFSError('L2_NS_DELETE', null, reason, { path, group, recursive })
                }

                // Open child to access its block map
                const [cError, cfh] = await this.open(path, group, { mode: 'rw' })
                if (cError) return abort(cError)

                const [pError, pfh] = await this.open(dirname, group, { mode: 'rw' })
                if (pError) return abort(pError)

                const [dirReadError, parentDir] = await pfh.readAsDir()
                if (dirReadError) return abort(dirReadError)
                
                if (!parentDir.children[basename]) return abort(new IBFSError('L2_NS_DELETE', 'File does not exist in the directory.', null, { path, group, recursive }))

                // Delete the child inside the VFS
                // It's deleted before physical changes, as any potential partial changes could render the file corrupt
                // or intertwined with other file's blocks, so erasing it from the in-mem file tree is safer.
                delete parent.children[basename]

                // Delete child from its parent directory physically on the disk.
                delete parentDir.children[basename]
                const dirWriteError = await pfh.writeAsDir(parentDir)
                if (dirWriteError) return abort(dirWriteError)

                // Free child's blocks.
                const addresses = cfh.fbm.allAddresses()
                for (const address of addresses) this.fs.adSpace.free(address)

                await cfh.close()
                await pfh.close()

            }

            else {

            }

        }
        catch (error) {
            return new IBFSError('L2_NS_DELETE', null, error as Error, { path, group })    
        }
    }

    // Private helpers -------------------------------------------------------------------------------------------------

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
     * Creates an empty node inside the physical filesystem and synchronizes the VFS to match the state.
     * @param path Path to the node to create.
     * @param group Group that is creating the node.
     * @param type Type of node to create.
     * @param keepPending Whether to keep the node's locked state as "pending"
     * @returns `[error, null] | [null, FileHandle]`
     */
    private async createEmptyNode(path: string, group: string, type: TNode['type'], keepPending?: boolean): T.XEavA<FileHandle, 'L2_NS_CREATE_NODE'> {

        let parentDir: FileHandle | undefined = undefined
        let parentNode: TDirectory

        const dirname = np.dirname(path)
        const basename = np.basename(path)

        const abort = async (cause: Error, meta: Record<any, any>) => {
            await parentDir?.close()
            if (parentNode && parentNode.children[basename]) parentNode.children[basename]!.lock = null
            return IBFSError.eav('L2_NS_CREATE_NODE', null, cause, meta)
        }

        try {

            const cantCreate = this.vfs.canMakeNode(path, group)    
            if (cantCreate) return abort(cantCreate, { path, group })

            const [resError, $parentNode] = this.vfs.resolveParent(path)
            if (resError) return await abort(resError, { path, group })
            parentNode = $parentNode
            
            const [parentError, $parentDir] = await this.open(dirname, group, { mode: 'rw' })
            if (parentError) return abort(parentError, { path, group })
            parentDir = $parentDir

            const [childError, childAddress] = await this.fs.createEmptyStructure({ type })
            if (childError) return await abort(childError, { path, group })

            const [dirReadError, dir] = await parentDir.readAsDir()
            if (dirReadError) return await abort(dirReadError, { path, group })

            dir.children[basename] = childAddress

            const dirWriteError = await parentDir.writeAsDir(dir)
            if (dirWriteError) return await abort(dirWriteError, { path, group })

            const parentCloseError = await parentDir.close()
            if (parentCloseError) return await abort(parentCloseError, { path, group })

            parentNode.children[basename] = VFS[type](childAddress)
            parentNode.children[basename].lock = keepPending ? 'pending' : null

            const [childOpenError, child] = await this.fs.open({ fileAddress: childAddress, mode: 'rw' })

            if (childOpenError) {
                parentNode.children[basename].lock = null
                return await abort(childOpenError, { path, group })
            }
            
            return [null, child]

        } 
        catch (error) {
            return IBFSError.eav('L2_NS_CREATE_NODE', null, error as Error, { path, group })    
        }
    }

    // TODO: Add error event handling
    private onStreamEnd(stream: FileReadStream | FileWriteStream, callback: () => void) {
        stream.on('end', callback)
        stream.on('close', callback)
        stream.on('finish', callback)
    }

}
