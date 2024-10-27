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

    /**
     * Encodes a directory object and returns a `UInt8Array` ready to be serialized and written to the disk.
     * @param dir Directory object
     * @returns [Error?, UInt8Array?]
     */
    public static encodeDirectoryObject(dir: Directory): T.XEav<Uint8Array, "L1_ST_DIRECTORY_ENCODE"> {
        try {
            const encoded = this.Directory.encode(dir)
            const intArray = encoded.finish()
            return [null, intArray]
        }
        catch (error) {
            return IBFSError.eav('L1_ST_DIRECTORY_ENCODE', null, error as Error)
        }
    }

    /**
     * Decodes a directory data buffer and returns an object ready for further processing.
     * @param obj Directory data buffer
     * @returns [Error?, Directory?]
     */
    public static decodeDirectoryObject(buf: Buffer): T.XEav<Directory, "L1_ST_DIRECTORY_DECODE"> {
        try {

            const decoded = this.Directory.decode(buf)
            const json = decoded.toJSON() as Directory

            json.children = Object.fromEntries(
                Object.entries(json.children)
                    .map(([key, value]) => [key, parseInt(value as any)])
            )

            return [null, json]
        } 
        catch (error) {
            return IBFSError.eav('L1_ST_DIRECTORY_DECODE', null, error as Error)
        }
    }

}

const x = Structs.encodeDirectoryObject({
    permissions: {
        'some-user-id': 1
    },
    children: {
        'recept.txt': 123,
        'test': 338109
    }
})

const y = Structs.decodeDirectoryObject(x[1])

console.log(x)
console.log(y)