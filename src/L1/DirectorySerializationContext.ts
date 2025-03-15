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
        // 0 = restricted, 
        // 1 = read, 
        // 2 = read/write, 
        // 3 = read/write/exec
        [user_id: string]: 0 | 1 | 2 | 3 
    },
    children: {
        // number - address of the resource
        [file_or_directory_name: string]: number 
    }
}

// Exports ========================================================================================

export default class DirectorySerializationContext {

    private static dirProto = path.join(__dirname, '../../schemas/Directories.proto')

    private declare root: pb.Root
    private declare dirProto: pb.Type

    private constructor() {}

    public static async createContext(): T.XEavA<DirectorySerializationContext, "L1_DIR_INIT"> {
        try {
            const self = new this()
            self.root = await pb.load(DirectorySerializationContext.dirProto)
            self.dirProto = self.root.lookupType('dir.Directory')
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_DIR_INIT', null, error as Error)
        }
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