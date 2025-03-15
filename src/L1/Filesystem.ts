// Imports =============================================================================================================

import type * as T from '../../types.js'
import * as C from '../Constants.js'

import Memory from '../L0/Memory.js'
import Volume, { TVolumeInit } from '../L0/Volume.js'
import DirectorySerializationContext from './DirectorySerializationContext.js'
import BlockSerializationContext from '../L0/BlockSerialization.js'

import IBFSError from '../errors/IBFSError.js'
import Time from '../misc/time.js'
import ssc from '../misc/safeShallowCopy.js'

// Types ===============================================================================================================

export interface TFSInit extends TVolumeInit {
    /** Whether to omit integrity checks when creating the volume & filesystem. */ initialIntegrity?: boolean
}

// Exports =============================================================================================================

export default class FilesystemContext {

    public declare volume: Volume
    public declare dsc:    DirectorySerializationContext

    private constructor() {}

    // Factory ------------------------------------------------------

    public static async createFilesystemRoot(init: TFSInit): T.XEavSA<'L1_FS_CREATE'> {
        
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
            const metaSectors = physicalBlockSize * Math.ceil(C.KB_64 / physicalBlockSize)
            const rootDirectoryHeadAddress = 1 + metaSectors + 0 // root + meta
            const rootDirectoryDataAddress = 1 + metaSectors + 1 // root + meta + root directory head

            volume.root.fsRoot = rootDirectoryHeadAddress
            const rbError = await volume.overwriteRootBlock()
            if (rbError) return new IBFSError('L1_FS_CREATE', null, rbError, ssc(init, ['aesKey']))

            // Create root directory -------------------------------------

            const [dcError, dc] = await DirectorySerializationContext.createContext()
            if (dcError) return new IBFSError('L1_FS_CREATE', null, dcError, ssc(init, ['aesKey']))

            const [dirError, rootDir] = dc.serializeDirectory({
                permissions: {
                    user1: 3
                },
                children: {
                    'hello.txt': 0
                }
            })
            if (dirError) return new IBFSError('L1_FS_CREATE', null, dirError, ssc(init, ['aesKey']))
    
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
                data: rootDir
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

    public static async open(image: string): T.XEavSA<'L1_FS_OPEN'> {
        try {

            const self = new this()
            
            const [openError, volume] = await Volume.open(image)
            if (openError) return new IBFSError('L1_FS_OPEN', null, openError, { image })
            self.volume = volume

            const [dscError, dsc] = await DirectorySerializationContext.createContext()
            if (dscError) return new IBFSError('L1_FS_OPEN', null, dscError, { image })
            self.dsc = dsc

        } 
        catch (error) {
            return new IBFSError('L1_FS_OPEN', null, error as Error, { image })
        }
    }

}