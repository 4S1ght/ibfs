// Imports =============================================================================================================

import type * as T                                              from '../../types.js'
import * as C                                                   from '../Constants.js'

import Memory                                                   from '../L0/Memory.js'
import Volume, { THeadBlockRead, TVolumeInit }                  from '../L0/Volume.js'
import BlockSerializationContext, { THeadBlock }                from '../L0/BlockSerialization.js'
import AddressSpace                                             from './alloc/AddressSpace.js'
import FileHandle, { FINALIZE_HANDLE_CLOSE, TFHOpenOptions }    from './file/FileHandle.js'
import DirectoryTables                                          from './directory/DirectoryTables.js'
import InstanceRegistry                                         from './caching/InstanceRegistry.js'

import VFS, { TDirectory, TNode }                               from '../L2/VirtualFilesystem.js'

import IBFSError                                                from '../errors/IBFSError.js'
import Time                                                     from '../misc/time.js'
import ssc                                                      from '../misc/safeShallowCopy.js'

// Types ===============================================================================================================

export interface TFSInit extends TVolumeInit {

}

export interface TFSOpenFile extends Omit<TFHOpenOptions, 'headAddress' | 'containingFilesystem'> {
    /** Address of the file. */ fileAddress: number
}

export interface TCreateStructOptions {
    /** Tye type of the structure */ type: THeadBlockRead['resourceType']
}

// Exports =============================================================================================================

export default class Filesystem {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    public declare volume:  Volume
    public declare adSpace: AddressSpace
    public declare aesKey:  Buffer

    private readonly _rh = new InstanceRegistry<number, FileHandle>()
    private readonly _wh = new InstanceRegistry<number, FileHandle>()

    private constructor() {}

    // Factory ------------------------------------------------------

    public static async createEmptyFilesystem(init: TFSInit): T.XEavSA<'L1_FS_CREATE'> {
        
        let volume: Volume
        
        try {

            // Create volume ---------------------------------------------

            const volumeCreateError = await Volume.createEmptyVolume(init)
            const [openError, $volume] = await Volume.open(init.fileLocation)

            if (volumeCreateError) return new IBFSError('L1_FS_CREATE', null, volumeCreateError, ssc(init, ['aesKey']))
            if (openError)         return new IBFSError('L1_FS_CREATE', null, openError, ssc(init, ['aesKey']))

            volume = $volume

            // Override root sector --------------------------------------

            const physicalBlockSize = BlockSerializationContext.BLOCK_SIZES[init.blockSize]
            const metaSectors = Math.ceil(C.KB_64 / physicalBlockSize)
            const rootDirectoryHeadAddress = 1 + metaSectors + 0 // root + meta
            const rootDirectoryDataAddress = 1 + metaSectors + 1 // root + meta + root directory head

            volume.root.fsRoot = rootDirectoryHeadAddress
            const rbError = await volume.overwriteRootBlock()
            if (rbError) return new IBFSError('L1_FS_CREATE', null, rbError, ssc(init, ['aesKey']))

            // Seed root directory --------------------------------------
    
            const headError = await volume.writeHeadBlock({
                created: Time.now(),
                modified: Time.now(),
                resourceType: 'DIR',
                address: rootDirectoryHeadAddress,
                next: 0,
                aesKey: init.aesKey,
                data: (() => {
                    const head = Memory.alloc(8)
                    head.writeInt64(rootDirectoryDataAddress)
                    return head.buffer
                })()
            })

            const dataError = await volume.writeDataBlock({
                address: rootDirectoryDataAddress,
                aesKey: init.aesKey,
                data: DirectoryTables.serialize({
                    children: {},
                    users: {},
                    meta: {}
                })
            })

            if (headError) return new IBFSError('L1_FS_CREATE', null, headError, ssc(init, ['aesKey']))
            if (dataError) return new IBFSError('L1_FS_CREATE', null, dataError, ssc(init, ['aesKey']))

        } 
        catch (error) {
            return new IBFSError('L1_FS_CREATE', null, error as Error, ssc(init, ['aesKey']))
        }
        finally {
            if (volume! && volume!.isOpen) await volume!.close()
        }
    }

    // Lifecycle -------------------------------------------------------------------------------------------------------

    public static async open(image: string, aesKey: Buffer, finish?: (dirTree: TNode) => void): T.XEavA<Filesystem, 'L1_FS_OPEN'> {
        try {

            const self = new this()
            self.aesKey = aesKey
            
            const [openError, volume] = await Volume.open(image)
            if (openError) return IBFSError.eav('L1_FS_OPEN', null, openError, { image })
            self.volume = volume

            self.adSpace = new AddressSpace({
                size: self.volume.root.blockCount,
                offset: Math.ceil(C.KB_64 / self.volume.bs.BLOCK_SIZE) + 1,
                cacheSize: self.volume.meta.ibfs.adSpaceCacheSize || C.DEFAULT_ADDRESS_MAP_CACHE_SIZE
            })

            const [scanError, dirTree] = await self.traverseAndLoad()
            if (scanError) return IBFSError.eav('L1_FS_OPEN', null, scanError, { image })

            if (finish) finish(dirTree)
            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN', null, error as Error, { image })
        }
    }

    /**
     * Scans the filesystem's entire file tree and maps out all allocated blocks.
     */
    private async traverseAndLoad(): T.XEavA<TNode, "L1_FS_ADSPACE_SCAN"> {

        let handle: FileHandle

        try {

            const scan = async (address: number): T.XEavA<TNode, "L1_FS_ADSPACE_SCAN"> => {

                // Open file handle
                const [openError, fh] = await this.open({ fileAddress: address, mode: 'r' })
                if (openError) return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, openError)
                handle = fh

                // Scan addresses
                for (const address of fh.fbm.allAddresses()) this.adSpace.markAllocated(address)

                // Get file size
                const [sizeError, size] = await fh.getFileLength()
                if (sizeError) { 
                    await fh.close(); 
                    return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, sizeError) 
                }

                if (fh.type === 'FILE') {

                    const closeError = await fh.close()
                    if (closeError) return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, closeError)

                    return [null, VFS.file(address, size)]

                }

                else {

                    const [readError, dir] = await fh.readAsDir()
                    const closeError = await fh.close()

                    if (readError) return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, readError)
                    if (closeError) return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, closeError)

                    const dirObj = VFS.dir(address, size) as TDirectory
                    dirObj.perms = dir.users

                    for (const filename in dir.children) {
                        if (Object.prototype.hasOwnProperty.call(dir.children, filename)) {

                            const [scanError, child] = await scan(dir.children[filename]!)
                            if (scanError) return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, scanError)

                            dirObj.children[filename] = child
                        }
                    }
                    
                    return [null, dirObj]

                }

            }

            return await scan(this.volume.root.fsRoot)

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_ADSPACE_SCAN', null, error as Error)
        }
        finally {
            try { await handle!.close() } catch {}
        }
    }

    // Methods ---------------------------------------------------------------------------------------------------------
    
    /**
     * Opens an IBFS file handle.  
     * Due to the filesystem's design, read-only handles are shared across multiple consumers.
     */
    public async open(options: TFSOpenFile): T.XEavA<FileHandle, 'L1_FS_OPEN_FILE'|'L1_FS_OPEN_EXREF'> {
        try {

            const createHandle = () => FileHandle.open({
                mode: options.mode,
                append: options.append,
                truncate: options.truncate,
                headAddress: options.fileAddress,
                containingFilesystem: this
            })

            // Check if there is a write-enabled handle
            const wh = this._wh.getRef(options.fileAddress)
            if (wh && wh.ref.deref()) return IBFSError.eav('L1_FS_OPEN_EXREF')

            // Attempt to reuse read-only handles and only 
            // create new ones if necessary.
            if (options.mode === 'r') {

                const existingRef = this._rh.reuse(options.fileAddress)
                if (existingRef) return [null, existingRef]

                const [openError, handle] = await createHandle()
                if (openError) return IBFSError.eav('L1_FS_OPEN_FILE', null, openError, options)

                this._rh.addRef(options.fileAddress, handle)

                handle.once('requests-close', () => {
                    const hasNoRemainingRefs = this._rh.removeRef(options.fileAddress)
                    if (hasNoRemainingRefs) handle[FINALIZE_HANDLE_CLOSE]()
                })

                return [null, handle]

            }
            
            // Create new write or read/write handle (exclusive access)
            else {

                // Make sure no other handle is using this file
                const cache = this._rh.getRef(options.fileAddress)
                const instance = cache && cache.ref.deref()
                if (instance) return IBFSError.eav(
                    'L1_FS_OPEN_EXREF',
                    'Could not open the file in write-enabled mode because it is already in use elsewhere and writing requires exclusive access.'
                )

                const [openError, handle] = await createHandle()
                if (openError) return IBFSError.eav('L1_FS_OPEN_FILE', null, openError, options)

                this._wh.addRef(options.fileAddress, handle)

                // No need to check for remaining refs as the handle is guaranteed to be exclusive
                handle.once('requests-close', () => {
                    this._wh.removeRef(options.fileAddress)
                    handle[FINALIZE_HANDLE_CLOSE]()
                })

                return [null, handle]

            }

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN_FILE', null, error as Error)
        }
    }

    /**
     * Used to create initial empty structures in the filesystem.
     * 
     * `Filesystem.open()` is used to open existing files, but can not create them directly as it requires
     * a valid file address. This method sets up the basic structure and returns the pointer which can then
     * in turn be used to open a file handle and begin writing or reading data.
     * 
     * **Note:** If the file type is set to `DIR` the internal directory structure will be created as well.
     * Only `FILE` types are initialized empty.
     */
    public async createEmptyStructure(options: TCreateStructOptions): T.XEavA<number, 'L1_FS_CREATE_STRUCT'> {
        try {
            
            const headAddress = this.adSpace.alloc()
            const dataAddress = this.adSpace.alloc()

            const headBody = Buffer.allocUnsafe(8)
            headBody.writeBigInt64LE(BigInt(dataAddress), 0)

            const headError = await this.volume.writeHeadBlock({
                created: Time.now(),
                modified: Time.now(),
                resourceType: options.type,
                next: 0,
                data: headBody,
                aesKey: this.aesKey,
                address: headAddress
            })

            if (headError) return IBFSError.eav('L1_FS_CREATE_STRUCT', null, headError)

            const dataBody = options.type === 'FILE'
                ? Buffer.alloc(0)
                : DirectoryTables.serialize({ children: {}, users: {}, meta: {} })

            const dataError = await this.volume.writeDataBlock({
                data: dataBody,
                aesKey: this.aesKey,
                address: dataAddress
            })

            if (dataError) return IBFSError.eav('L1_FS_CREATE_STRUCT', null, dataError)

            return [null, headAddress]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_CREATE_STRUCT', null, error as Error)
        }
    }

}