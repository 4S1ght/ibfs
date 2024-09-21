/// <reference path="../types.d.ts"/>
// Imports ========================================================================================

import path                                     from "node:path"
import fs                                       from "node:fs/promises"
import crypto                                   from "node:crypto"
import type { WriteStream }                     from "node:fs"

import Serialize, { RootSector, SectorSize }    from "@L0/Serialize.js"
import AES, { AESCipher }                       from "@L0/AES.js"
import Memory                                   from "@L0/Memory.js"
import IBFSError                                from "@errors"
import * as h                                   from "@helpers"
import * as C                                   from "@constants"

// Types ==========================================================================================

export interface VolumeCreateInit {
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
    /** Progress update configuration. */
    update?: {
        /** 
         * Specifies every how many bytes written to the disk to call an update callback. 
         * @default 5_000_000
         */
        frequency?: number
        /** A callback called on each update as the volume is being created. */
        callback: (status: VolumeCreateStatus, written: number) => any
    }
}

type VolumeCreateStatus = 
    | 'setup'
    | 'bootstrap'
    | 'write'
    | 'done'

// Module =========================================================================================

export default class Volume {

    private declare handle: fs.FileHandle
    private declare bs: Serialize
    public  declare rs: RootSector

    private constructor() {}

    public static async create(init: VolumeCreateInit): EavSingleAsync<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {
            
            const update     = init.update ? init.update.callback : (() => {})
            const updateFreq = init.update ? init.update.frequency || 5_000_000 : 5_000_000

            // Setup ================================================
            
            update('setup', 0)

            // Ensure file EXT
            if (path.extname(init.file) !== C.VD_FILE_EXT) init.file != C.VD_FILE_EXT

            const aesIV = crypto.randomBytes(16)
            const [aesKeyError, aesKey] = AES.deriveAESKey(init.aesCipher, init.aesKey)
            if (aesKeyError) return aesKeyError

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
                address: rootDirHeadAddress,
                aesKey
            })
            if (dirHeadError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, dirHeadError, h.ssc(init, ['aesKey']))


            // Root directory content block =========================
    
            const [dirStoreError, dirStore] = serialize.createStorageBlock({
                data: Buffer.from(JSON.stringify({})),
                blockSize: 0,
                address: rootDirStoreAddress,
                aesKey
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
            let bw = 0

            const { bytesWritten: bwBootstrapped } = await file.write(Buffer.concat([
                rootSector,
                metaBlock,
                dirHead,
                dirStore
            ]))

            for (let i = 2; i < init.sectorCount; i++) {

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

                // Report amount of bytes written.
                if (ws.bytesWritten - bw >= updateFreq) {
                    update('write', ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

            if (wsError!) {
                return new IBFSError(
                    'L0_VCREATE_WS_ERROR', 
                    'WriteStream error while creating the volume.', 
                    wsError.error, 
                    h.ssc({ ...init, failedAtSector: wsError.i }, ['aesKey'])
                )
            }

            update('done', ws.bytesWritten + bwBootstrapped)

        } 
        catch (error) {
            return new IBFSError('L0_VCREATE_CANT_CREATE', null, error as Error, h.ssc(init, ['aesKey']))
        }
        finally {
            if (ws!) ws.close()
            if (file!) await file.close()
        }

    }

    public static async open(image: string): EavAsync<Volume, IBFSError> {

        const self = new this()

        try {

            self.handle = await fs.open(image, 'r+', 0o600)

            const rsData = Buffer.alloc(1024)
            await self.handle.read({ offset: 0, length: 1024, buffer: rsData })
            const [rsError, rs] = Serialize.readRootSector(rsData)

            if (rsError) return IBFSError.eav(
                'L0_VOPEN_ROOT_DESERIALIZE',
                'Failed to deserialize the root sector needed for further initialization.',
                rsError, { image }
            )
            if (rs.nodeCryptoCompatMode === false) return IBFSError.eav(
                'L0_VOPEN_MODE_INCOMPATIBLE',
                'The IBFS image was created without compatibility for NodeJS crypto APIs and is impossible to be decrypted by this driver.',
                null, { image }
            )

            // Expected size     Root sector     Metadata block                                     User data
            const expectedSize = rs.sectorSize + rs.sectorSize*Math.ceil(1024*1024/rs.sectorSize) + rs.sectorSize*rs.sectorCount
            const { size } = await self.handle.stat()

            if (size !== expectedSize) return IBFSError.eav(
                'L0_VOPEN_SIZE_MISMATCH',
                `Volume file size differs from size expected from volume metadata.`,
                null, { size, expectedSize, diff: Math.abs(size - expectedSize) }
            )


            self.rs = rs

            return [null, self]
        } 
        catch (error) {
            if (self.handle) await self.handle.close()
            return [new IBFSError('L0_VOPEN_CANT_OPEN', `Can't initialize the volume.`, error as Error, { image }), null] 
        }
    }

}
