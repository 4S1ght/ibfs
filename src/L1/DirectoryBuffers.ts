// Imports ========================================================================================

import type * as T from '../../types.js'

import fs from 'node:fs'
import path from 'node:path'
import pb from 'protobufjs'

import IBFSError from '../errors/IBFSError.js'
import { dirname } from "../misc/relatives.js"
const __dirname = dirname(import.meta.url)

// Types ==========================================================================================

export interface TDirectory {
    permissions: {
        [user_id: string]: 0 | 1 | 2 | 3 // 0 = denied, 1 = read, 2 = read/write, 3 = read/write/exec
    },
    children: {
        [file_or_directory_name: string]: number // number - address of the resource
    }
}

// Exports ========================================================================================

export default class DirectoryBuffersContext {

    private root: pb.Root
    private dirProto: pb.Type

    constructor() {
        this.root = pb.loadSync(path.join(__dirname, '../../schemas/Directories.proto'),)
        this.dirProto = this.root.lookupType('dir.Directory')
    }

    public serializeDirectory(directory: TDirectory): T.XEav<Buffer, 'L1_DIR_SR'> {
        try {

            const encoded = this.dirProto.encode(directory)
            const intArray = encoded.finish()
            const buffer = Buffer.from(intArray)

            return [null, buffer]

        }
         catch (error) {
            return IBFSError.eav('L1_DIR_SR', null, error as Error, directory)
        }
    }

    public deserializeDirectory(buffer: Buffer): T.XEav<TDirectory, 'L1_DIR_DS'> {
        try {

            const decoded = this.dirProto.decode(buffer)
            const json = decoded.toJSON() as TDirectory

            json.children = Object.fromEntries(
                // Why can't configure protobuf to use normal numbers? I have no idea.
                Object.entries(json.children)
                    .map(([key, value]) => [key, parseInt(value as any)])
            )

            return [null, json]
            
        }
        catch (error) {
            return IBFSError.eav('L1_DIR_DS', null, error as Error)
        }
    }

}