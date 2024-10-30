// Imports ========================================================================================

import Volume, { EmptyVolumeInit } from "@L0/Volume.js"

import IBFSError    from "@errors"
import * as m       from '@misc'
import type * as T  from '@types'

// Types ==========================================================================================

export interface FSInit extends EmptyVolumeInit {

}

// Module =========================================================================================

export default class Filesystem {

    public static async createEmptyFilesystem(init: FSInit):
        T.XEavSA<'L1_FSCREATE_CANT_CREATE'> {
        try {
                 
            // - Create volume
            // - Open volume
            // - Read root sector data
            // - Create root directory

        } 
        catch (error) {
            return new IBFSError('L1_FSCREATE_CANT_CREATE', null, error as Error, m.ssc(init, ['aesKey', 'update']))
        }
    }    

}