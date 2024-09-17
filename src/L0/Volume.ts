/// <reference path="../types.d.ts"/>
// Imports ========================================================================================

import path                         from "node:path"
import fs                           from "node:fs/promises"
import crypto                       from "node:crypto"
import type { WriteStream }         from "node:fs"

import IBFSError                    from "@errors/IBFSError.js"
import Serialize, { SectorSize }    from "@L0/Serialize.js"
import AES, { AESCipher }           from "@L0/AES.js"
import Memory                       from "@L0/Memory.js"
import * as h                       from "@helpers"
import * as C                       from "@constants"

// Types ==========================================================================================

export interface VolumeInit {
    /** The location of the virtual disk file. */
    file: string
    /** Size of individual sectors inside the virtual disk file. */
    sectorSize: SectorSize
    /** Number of usable data sectors inside the virtual disk file (does not include volume metadata). */
    sectorCount: number
    /** AES cipher used. Leave empty for no encryption. */
    aesCipher: keyof typeof AESCipher
    /** AES encryption key used. */
    aesKey?: Buffer | string
    /** A callback called on each update as the volume is being created. */
    onUpdate?: (status: VolumeCreateStatus, written: number) => any
}

type VolumeCreateStatus = 
    | 'setup'
    | 'bootstrap'
    | 'write'
    | 'done'

// Module =========================================================================================

export default class Volume {

    private constructor() {}

    public static async create(init: VolumeInit): EavSingleAsync<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {
            
            const update = init.onUpdate || (() => {})

            // Setup ================================================
            update('setup', 0)

            // Ensure file EXT
            if (path.extname(init.file) !== C.VD_FILE_EXT) init.file != C.VD_FILE_EXT

            const aesIV = crypto.randomBytes(16)
            const aesKey = {
                'aes-128-xts': AES.derive256BitAESKey(init.aesKey!),
                'aes-256-xts': AES.derive512BitAESKey(init.aesKey!),
                '':            Buffer.alloc(0)
            }[init.aesCipher!]

            // deps setup
            const serialize = new Serialize({ 
                diskSectorSize: init.sectorSize,
                cipher: init.aesCipher,
                iv: aesIV
            })

            // Root sector ==========================================
            update('bootstrap', 0)

            // Deps
            const metadataSectors = Math.ceil(1024*1024 / init.sectorSize)
            const rootDirHeadAddress = metadataSectors + 1
            const rootDirStoreAddress = metadataSectors + 2

            // Creates the key check buffer used later to verify the correctness of
            // user supplied decryption key.
            const aesKeyCheck = (() => {
                if (!init.aesCipher) return Buffer.alloc(16)
                return serialize.AES.encrypt(Buffer.alloc(16), aesKey, 0)
            })()

            // Root sector
            const [rootError, rootSector] = Serialize.createRootSector({
                specMajor:              C.FS_SPEC[0],
                specMinor:              C.FS_SPEC[1],
                sectorSize:             init.sectorSize,
                sectorCount:            init.sectorCount,
                metadataSectors:        metadataSectors,
                aesCipher:              AESCipher[init.aesCipher || ''],
                aesIV:                  aesIV,
                nodeCryptoCompatMode:   true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          rootDirHeadAddress
            })           
            if (rootError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, rootError, h.ssc(init, ['aesKey']))

            // Metadata block =======================================

            const [metaError, metaBlock] = serialize.createMetaBlock({ ibfs: {} })
            if (metaError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, metaError, h.ssc(init, ['aesKey']))

            // Root directory head block ============================

            const rootDirHeadData = Memory.alloc(serialize.HEAD_CONTENT)
            // Address of the first root directory storage block and its block size
            rootDirHeadData.writeInt64(rootDirStoreAddress)
            rootDirHeadData.writeInt8(0)

            const [dirHeadError, dirHead] = serialize.createHeadBlock({
                created: Date.now()/1000,
                modified: Date.now()/1000,
                data: rootDirHeadData.buffer,
                next: 0,
                nextSize: 0,
                blockSize: 0,
                address: rootDirHeadAddress
            })
            if (dirHeadError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, dirHeadError, h.ssc(init, ['aesKey']))


            // Root directory content block =========================

            const [dirStoreError, dirStore] = serialize.createStorageBlock({
                data: Buffer.from(JSON.stringify({})),
                blockSize: 1,
                address: rootDirStoreAddress
            })            
            if (dirStoreError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, dirStoreError, h.ssc(init, ['aesKey']))


            // File write ===========================================
            update('write', 0)

            file = await fs.open(init.file, 'w+', 0o600)
            ws = file.createWriteStream({ highWaterMark: init.sectorSize * 128 })

            const bf = Buffer.alloc(init.sectorSize)
            let canWrite = true
            let broken = false
            let wsError: { i: number, error: Error }

            file.write(Buffer.concat([
                rootSector,
                metaBlock,
                dirHead,
                dirStore
            ]))

            for (let i = 0; i < init.sectorCount; i++) {

                if (broken) break

                canWrite = ws.write(bf, error => {
                    if (error && !broken) {
                        broken = true
                        wsError = { i, error }
                        ws.close()
                        file.close()
                    }
                })

                // Pause the loop if the stream fills up
                if (!canWrite) await new Promise<void>(resume => ws.on('drain', () => {
                    ws.removeAllListeners('drain')
                    resume()
                }))
                
                update('bootstrap', ws.bytesWritten)

            }

            if (wsError!) {
                return new IBFSError(
                    'L0_VCREATE_WS_ERROR', 
                    'WriteStream error while creating the volume.', 
                    wsError.error, 
                    h.ssc({ ...init, failedAtSector: wsError.i }, ['aesKey'])
                )
            }

            update('done', ws.bytesWritten)

        } 
        catch (error) {
            if (ws!) ws.close()
            if (file!) file.close()
        }

    }

}
