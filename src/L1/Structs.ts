// Imports ========================================================================================

import path from 'node:path'
import url  from 'node:url'
import fs   from 'node:fs/promises'
import pb   from 'protobufjs'

import type * as T from '@types'
import IBFSError from '@errors'

// Types ==========================================================================================

export interface Directory {
    permissions: {
        [user_id: string]: 1 | 2 | 3 // 1 = read, 2 = read/write, 3 = read/write/exec
    },
    children: {
        [file_or_directory_name: string]: number // number - address of the resource
    }
}

// Module =========================================================================================

const dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default class Structs {

    public static pb = pb.loadSync(path.join(dirname, '../../Structs.proto'))
    public static Directory = this.pb.lookupType('Structs.Directory')

    public static serializeDirectoryObject(dir: Directory) {
        try {
            const encoded = this.Directory.encode(dir)
            return [null, encoded]
        } 
        catch (error) {
            
        }
    }

    public static decodeDirectoryObject(obj: Buffer): T.XEav<Directory, "L1_ST_DIRECTORY_DECODE"> {
        try {
            const decoded = this.Directory.decode(obj)
            const json = decoded.toJSON() as Directory
            return [null, json]
        } 
        catch (error) {
            return IBFSError.eav('L1_ST_DIRECTORY_DECODE', null, error as Error)
        }
    }

}