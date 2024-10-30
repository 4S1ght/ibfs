// Imports ========================================================================================

import path from 'node:path'
import url  from 'node:url'
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

export default class DirectoryTranscode {

    public declare pb: pb.Root 
    public declare proto: pb.Type

    private constructor() {}

    public static async instance(): T.XEavA<DirectoryTranscode, 'L1_DIR_INIT'> {
        try {
            const self = new this()
            self.pb = await pb.load(path.join(dirname, '../../Structs.proto'))
            self.proto = self.pb.lookupType('Structs.Directory')
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_DIR_INIT', null, error as Error)
        }
    }

    /**
     * Encodes a directory object and returns a `UInt8Array` ready to be serialized and written to the disk.
     * @param dir Directory object
     * @returns [Error?, UInt8Array?]
     */
    public serializeDirectoryObject(dir: Directory): T.XEav<Uint8Array, "L1_DIR_ENCODE"> {
        try {
            const encoded = this.proto.encode(dir)
            const intArray = encoded.finish()
            return [null, intArray]
        }
        catch (error) {
            return IBFSError.eav('L1_DIR_ENCODE', null, error as Error)
        }
    }

    /**
     * Decodes a directory data buffer and returns an object ready for further processing.
     * @param obj Directory data buffer
     * @returns [Error?, Directory?]
     */
    public deserializeDirectoryObject(buf: Buffer): T.XEav<Directory, "L1_DIR_DECODE"> {
        try {

            const decoded = this.proto.decode(buf)
            const json = decoded.toJSON() as Directory

            json.children = Object.fromEntries(
                Object.entries(json.children)
                    .map(([key, value]) => [key, parseInt(value as any)])
            )

            return [null, json]
        } 
        catch (error) {
            return IBFSError.eav('L1_DIR_DECODE', null, error as Error)
        }
    }

}