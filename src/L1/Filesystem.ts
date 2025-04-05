// Imports =============================================================================================================

import type * as T                      from '../../types.js'
import * as C                           from '../Constants.js'

import Memory                           from '../L0/Memory.js'
import Volume, { TVolumeInit }          from '../L0/Volume.js'
import BlockSerializationContext        from '../L0/BlockSerialization.js'
import FileBlockMap                     from './file/FileBlockMap.js'
import AddressSpace                     from './alloc/AddressSpace.js'
import FileDescriptor                   from './file/FileDescriptor.js'
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
                offset: Math.ceil(C.KB_64 / self.volume.bs.BLOCK_SIZE),
                cacheSize: self.volume.meta.ibfs.adSpaceCacheSize || C.DEFAULT_ADDRESS_MAP_CACHE_SIZE
            })

            // TODO: Scan the volume to initialize the address space
            // or load the address space from a cached file.

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN', null, error as Error, { image })
        }
    }

    // Methods ---------------------------------------------------------------------------------------------------------

    public async open(fileAddress: number, integrity = true): T.XEavA<FileDescriptor, 'L1_FS_OPEN_FILE'> {
        try {
            
            const [openError, descriptor] = await FileDescriptor.open({
                containingFilesystem: this,
                headAddress: fileAddress
            })

            return openError 
                ? IBFSError.eav('L1_FS_OPEN_FILE', null, openError, { fileAddress, integrity })
                : [null, descriptor]

        } 
        catch (error) {
            return IBFSError.eav('L1_FS_OPEN_FILE', null, error as Error)
        }
    }

}