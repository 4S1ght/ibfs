/// <reference path="../types.d.ts"/>
// Imports ========================================================================================

import path from "node:path"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import zlib from "node:zlib"
import type { WriteStream } from "node:fs"

import Memory from "./Memory.js"
import SectorSerialize, { SectorSize } from "./SectorSerialize.js"
import SectorAES, { AESCipher } from "./SectorAES.js"
import IBFSError from "../errors/IBFSError.js"
import { FS_SPEC, VD_FILE_EXT } from '../Constants.js'
import { sanitize } from "../Helpers.js"

// Types ==========================================================================================

export interface VolumeCreateConfig {
    /** Virtual disk file location. */
    volume: string
    /** Size of individual sectors. */
    sectorSize: SectorSize
    /** Total number of usable data sectors. */
    sectorCount: number
    /** AES encryption used */
    aesCipher?: keyof typeof AESCipher
    /** AES encryption key */
    aesKey?: Buffer | string
    /** A callback called on each update as the volume is being created. */
    onUpdate?: (status: VolumeCreateUpdate, written: number) => any
}

type VolumeCreateUpdate = 
      'setup:deps' 
    | 'setup:root' 
    | 'setup:metadata' 
    | 'setup:root_dir_index' 
    | 'setup:root_dir_store'
    | 'setup:bootstrap'
    | 'write:bootstrap'
    | 'write:allocate'

// Module =========================================================================================

export default class Volume {

    private constructor() {}

    public static async create(config: VolumeCreateConfig): EavSingleAsync<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {

            // Setup ==============================================================================

            const update = config.onUpdate || (() => {})

            update('setup:deps', 0)

            // Add file extension
            if (path.extname(config.volume) !== VD_FILE_EXT) config.volume += VD_FILE_EXT

            const aesIV = crypto.randomBytes(16)
            const aesKey = Buffer.alloc({ 'aes-128-xts': 32, 'aes-256-xts': 64, '': 0 }[config.aesCipher!])
            Buffer.from(config.aesKey!).copy(aesKey)

            // Set up deps
            const serialize = new SectorSerialize({ sectorSize: config.sectorSize })
            const aes = new SectorAES({ iv: aesIV, cipher: config.aesCipher || '' })


            // Root sector ========================================================================

            update('setup:root', 0)

            // Metadata
            const metadataSectors = Math.ceil(1024*1024 / config.sectorSize)

            // Creates the key check buffer used later to verify the correctness of
            // user supplied decryption key.
            const aesKeyCheck = (() => {
                if (!config.aesCipher) return Buffer.alloc(16)
                const aes = new SectorAES({ cipher: config.aesCipher!, iv: aesIV })
                return aes.encrypt(Buffer.alloc(16), aesKey, 0)
            })()

            // Root sector
            const rootSector = SectorSerialize.createRootSector({
                specMajor:              FS_SPEC[0],
                specMinor:              FS_SPEC[1],
                sectorSize:             config.sectorSize,
                sectorCount:            config.sectorCount,
                metadataSectors:        metadataSectors,
                aesCipher:              AESCipher[config.aesCipher || ''],
                aesIV:                  aesIV,
                nodeCryptoCompatMode:   true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          metadataSectors + 1
            })

            // Metadata block =====================================================================

            update('setup:metadata', 0)

            const metadata = Memory.alloc(metadataSectors * config.sectorSize)
            metadata.writeString(JSON.stringify({ ibfs: {} }))
            const metadataBlock = metadata.buffer

            // Root directory index ===============================================================

            update('setup:root_dir_index', 0)

            const rootDirIndexData = Memory.alloc(serialize.HEAD_CONTENT)
            // First root directory storage block address and its block size
            rootDirIndexData.writeInt64(metadataSectors + 2)
            rootDirIndexData.writeInt8(0)

            // Encrypt sector data if AES enabled
            aes.encrypt(rootDirIndexData.buffer, aesKey, metadataSectors + 1)

            const rootDirIndex = serialize.createHeadSector({
                created: Date.now(),
                modified: Date.now(),
                data: rootDirIndexData.buffer,
                next: 0,
                crc32Sum: zlib.crc32(rootDirIndexData.buffer),
                blockRange: 0,
                endPadding: serialize.HEAD_CONTENT - rootDirIndexData.buffer.length
            })


            // Root directory content =============================================================

            update('setup:root_dir_store', 0)

            const rootDirStoreData = Memory.alloc(serialize.STORE_CONTENT)
            rootDirStoreData.writeString(JSON.stringify({}))
            // Encrypt sector data if AES enabled
            aes.encrypt(rootDirStoreData.buffer, aesKey, metadataSectors + 2)

            const rootDirStore = serialize.createStorageSector({
                data: rootDirStoreData.buffer,
                next: 0,
                crc32Sum: zlib.crc32(rootDirStoreData.buffer),
                blockRange: 0,
                endPadding: serialize.STORE_CONTENT - rootDirStoreData.buffer.length
            })

            // File write =========================================================================

            update('setup:bootstrap', 0)

            const file = await fs.open(config.volume, 'w+', 0o600)
            const ws = file.createWriteStream({ highWaterMark: config.sectorSize * 300 })
            const bf = Buffer.alloc(config.sectorSize)
            let canWrite = true
            let broken = false
            let bw = 0

            update('write:bootstrap', 0)

            file.write(Buffer.concat([
                rootSector,
                metadataBlock,
                rootDirIndex,
                rootDirStore
            ]))

            update('write:allocate', 0)

            for (let i = 0; i < config.sectorCount; i++) {
                
                if (broken) break

                // Write to the stream
                canWrite = ws.write(bf, error => {
                    if (error && !broken) {
                        broken = true
                        file.close()
                        return new IBFSError(
                            'L0_VCREATE_WS_ERROR', 
                            'WriteStream error while creating the volume.', 
                            error as Error, 
                            sanitize({ ...config, failedSectorPosition: i }, ['aesKey'])
                        )
                    }
                })

                // Pause the loop if the stream fills up
                if (!canWrite) await new Promise<void>(resume => ws.on('drain', () => {
                    ws.removeAllListeners('drain')
                    resume()
                }))
                
                if (ws.bytesWritten - bw >= 100_000_000) {
                    update('write:allocate', ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

        } 
        catch (error) {
            return new IBFSError('L0_VCREATE_CANT_CREATE', undefined, error as Error)
        }
        finally {
            if (ws!) ws.close()
            if (file!) file.close()
        }
    }

}