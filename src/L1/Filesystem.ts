// Imports =============================================================================================================

import type * as T                      from '../../types.js'
import * as C                           from '../Constants.js'

import Memory                           from '../L0/Memory.js'
import Volume, { TVolumeInit }          from '../L0/Volume.js'
import BlockSerializationContext        from '../L0/BlockSerialization.js'
import AddressSpace                     from './alloc/AddressSpace.js'
import FileHandle                       from './file/FileHandle.js'
import DirectoryTable                   from './tables/DirectoryTables.js'

import IBFSError                        from '../errors/IBFSError.js'
import Time                             from '../misc/time.js'
import ssc                              from '../misc/safeShallowCopy.js'

// Types ===============================================================================================================

export interface TFSInit extends TVolumeInit {
    /** Whether to omit integrity checks when creating the volume & filesystem. */ initialIntegrity?: boolean
}

// Exports =============================================================================================================

export default class Filesystem {

    public declare volume:  Volume
    public declare adSpace: AddressSpace
    public declare aesKey:  Buffer

    private constructor() {}

    // Factory ------------------------------------------------------

    public static async createEmptyFilesystem(init: TFSInit): T.XEavSA<'L1_FS_CREATE'> {
        
        let volume: Volume
        
        try {

            // Create volume ---------------------------------------------

            const volumeCreateError = await Volume.createEmptyVolume(init)
            const [openError, $volume] = await Volume.open(init.fileLocation, init.initialIntegrity)

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

            // Create root directory -------------------------------------
    
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
                data: DirectoryTable.serializeDRTable({
                    ch: {}, usr: {}, md: {}
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

    public static async open(image: string, aesKey: Buffer): T.XEavA<Filesystem, 'L1_FS_OPEN'> {
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

            // TODO: Scan the volume to initialize the address space
            // or load the address space from a cached file.
            const adSpaceError = await self.loadAddressSpace()
            if (adSpaceError) return IBFSError.eav('L1_FS_OPEN', null, adSpaceError, { image })


            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN', null, error as Error, { image })
        }
    }

    /**
     * Loads the address space from disk into memory.  
     * It is done either by scanning the volume and mapping out all allocated blocks
     * or by loading ab already composed bitmap residing next to the volume.
     */
    private async loadAddressSpace(): T.XEavSA<"L1_FS_ADSPACE_LOAD"> {
        try {

            const bmpName = this.volume.host.replace(C.VOLUME_EXT_NAME, C.ADSPACE_EXT_NAME)
            const loadError = await this.adSpace.loadBitmap(bmpName)

            // Address space loaded from cache
            if (!loadError) return

            // Cache file not found - scan the volume
            if (loadError.code === 'L1_AS_BITMAP_LOAD_NOTFOUND') {
                const scanError = await this.scanForOccupancy()
                if (scanError) return new IBFSError('L1_FS_ADSPACE_LOAD', null, scanError as Error)
            }
            // Unknown error - Propagate
            else {
                return new IBFSError('L1_FS_ADSPACE_LOAD', null, loadError as Error)
            }
            
        } 
        catch (error) {
            return new IBFSError('L1_FS_ADSPACE_LOAD', null, error as Error)
        }
    }

    /**
     * Scans the filesystem's entire file tree and maps out all allocated blocks.
     * This is a potentially heavy and long task and should only be done if the
     * cache is missing.
     */
    private async scanForOccupancy(): T.XEavSA<"L1_FS_ADSPACE_SCAN"> {
        try {
            
            const scan = async (address: number) => {

                // Open file descriptor and scan it
                const [openError, fh] = await this.open(address)
                if (openError) return new IBFSError('L1_FS_ADSPACE_SCAN', null, openError as Error)
                for (const address of fh.fbm.allAddresses()) this.adSpace.markAllocated(address)

                // Scan subdirectories & files
                if (fh.type === 'DIR') {

                    const [readError, data] = await fh.readFile()
                    if (readError) return new IBFSError('L1_FS_ADSPACE_SCAN', null, readError as Error)
                    const dir = DirectoryTable.deserializeDRTable(data)
                
                    for (const filename in dir.ch) {
                        if (Object.prototype.hasOwnProperty.call(dir.ch, filename)) {
                            await scan(dir.ch[filename]!)
                        }
                    }

                }

            }

            await scan(this.volume.root.fsRoot)

        } 
        catch (error) {
            return new IBFSError('L1_FS_ADSPACE_SCAN', null, error as Error)
        }
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    public async open(fileAddress: number, integrity = true): T.XEavA<FileHandle, 'L1_FS_OPEN_FILE'> {
        try {
            
            const [openError, handle] = await FileHandle.open({
                containingFilesystem: this,
                headAddress: fileAddress,
                integrity,
                // TODO: use object for Filesystem.open
                // mode: 'r',
                // append: false,
                // truncate: false,
                // create: false
            })

            return openError 
                ? IBFSError.eav('L1_FS_OPEN_FILE', null, openError, { fileAddress, integrity })
                : [null, handle]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN_FILE', null, error as Error)
        }
    }

}