// Imports ========================================================================================

import type * as T  from '@types'


import IBFSError                   from "@errors"
import * as m                      from '@misc'
import Memory                      from "@L0/Memory.js"
import DirectorySR                 from "@L1/DirectorySerialize.js"
import Volume, { EmptyVolumeInit } from "@L0/Volume.js"

// Types ==========================================================================================

export interface FSInit extends EmptyVolumeInit {

}

// Module =========================================================================================

export default class Filesystem {

    /** Underlying filesystem volume */
    public declare volume: Volume

    /**
     * Creates an empty filesystem and initializes it.
     * 
     * This function sets up a new volume and prepares the root directory
     * within the filesystem. It handles the creation of the volume, opening
     * it, and setting the root sector and directory. Any errors during these
     * processes are captured and returned.
     * 
     * @param init - Initial filesystem configuration parameters.
     * @returns Error if the filesystem creation fails.
     */
    public static async createEmptyFilesystem(init: FSInit):
        T.XEavSA<'L1_FSCREATE_CANT_CREATE'> {
        try {

            // Create volume ----------------------------------------------------------------------

            const volumeCreateError = await Volume.createEmptyVolume(init)
            const [openError, volume] = await Volume.open(init.file)

            if (volumeCreateError) return new IBFSError('L1_FSCREATE_CANT_CREATE', null, volumeCreateError)
            if (openError)         return new IBFSError('L1_FSCREATE_CANT_CREATE', null, openError)
        
            // Override root sector ---------------------------------------------------------------

            // - Read & update root sector data
            const rs                = volume.rs
            const rootDirHeadAddr   = 1 + rs.metadataSectors     // root + meta
            const rootDirStoreAddr  = 1 + rs.metadataSectors + 1 // root + meta + root directory head
            
            rs.rootDirectory = rootDirHeadAddr 

            const rsError = await volume.overwriteRootSector(rs)
            if (rsError) return new IBFSError('L1_FSCREATE_CANT_CREATE', null, rsError)

            // Create root directory --------------------------------------------------------------

            const [dsrError, dsr] = await DirectorySR.instance()
            if (dsrError) return new IBFSError('L1_FSCREATE_CANT_CREATE', null, dsrError)

            const [dirError, rootDir] = dsr.serializeDirectoryObject({
                permissions: {},
                children: {}
            })
            if (dirError) return new IBFSError('L1_FSCREATE_CANT_CREATE', null, dirError)


            const storeError = await volume.writeStoreBlock({
                data: rootDir,
                blockSize: 0,
                address: rootDirStoreAddr
            })

            const headError = await volume.writeHeadBlock({
                created: Math.floor(Date.now()/1000),
                modified: Math.floor(Date.now()/1000),
                next: 0,
                nextSize: 0,
                blockSize: 0,
                resourceType: 0,
                address: rootDirHeadAddr,
                data: (() => {
                    const headTable = Memory.alloc(9)
                    headTable.writeInt64(rootDirStoreAddr)
                    headTable.writeInt8(0)
                    return headTable.buffer
                })()
            })

            if (storeError) return new IBFSError('L1_FSCREATE_CANT_CREATE', null, storeError)
            if (headError)  return new IBFSError('L1_FSCREATE_CANT_CREATE', null, headError)

        } 
        catch (error) {
            return new IBFSError('L1_FSCREATE_CANT_CREATE', null, error as Error, m.ssc(init, ['aesKey', 'update']))
        }
    }    

}