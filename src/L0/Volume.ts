/// <reference path="../types.d.ts"/>
// Imports ========================================================================================

import path from "node:path"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import zlib from "node:zlib"

import Memory from "./Memory.js"
import SectorSerialize, { SectorSize } from "./SectorSerialize.js"
import SectorAES, { AESCipher } from "./SectorAES.js"
import IBFSError from "../errors/IBFSError.js"
import { FS_SPEC, VD_FILE_EXT } from '../Constants.js'

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
    onUpdate: () => any
}

// Module =========================================================================================

export default class Volume {

    private constructor() {}

    public static async create(config: VolumeCreateConfig): EavSingleAsync<IBFSError> {
        try {

            // Setup ==============================================================================

            // Add file extension
            if (path.extname(config.volume) !== VD_FILE_EXT) config.volume += VD_FILE_EXT

            // Set up serializer
            const serialize = new SectorSerialize({ sectorSize: config.sectorSize })

            // Root sector ========================================================================

            // Metadata
            const metadataSectors = Math.ceil(1024*1024 / config.sectorSize)

            // Creates the key check buffer used later to verify the correctness of
            // user supplied decryption key.
            const aesKeyCheck = (() => {
                if (!config.aesCipher) return Buffer.alloc(16)
                // Parse key
                const key = Buffer.alloc({ 'aes-128-xts': 32, 'aes-256-xts': 64}[config.aesCipher!])
                Buffer.from(config.aesKey!).copy(key)
                // Encrypt
                const aes = new SectorAES({ cipher: config.aesCipher!, iv: Buffer.alloc(16) })
                return aes.encrypt(Buffer.alloc(16), key, 0)
            })()

            // Root sector
            const rootSector = SectorSerialize.createRootSector({
                specMajor:              FS_SPEC[0],
                specMinor:              FS_SPEC[1],
                sectorSize:             config.sectorSize,
                sectorCount:            config.sectorCount,
                metadataSectors:        metadataSectors,
                aesCipher:              AESCipher[config.aesCipher || ''],
                aesIV:                  crypto.randomBytes(16),
                nodeCryptoCompatMode:   true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          metadataSectors + 1
            })

            // Metadata block =====================================================================

            const metadata = Memory.alloc(metadataSectors * config.sectorSize)
            metadata.writeString(JSON.stringify({ ibfs: {} }))
            const metadataBlock = metadata.buffer

            // Root directory index ===============================================================

            const rootDirIndexData = Memory.alloc(serialize.HEAD_CONTENT)
            // First root directory storage block address and its block size
            rootDirIndexData.writeInt64(metadataSectors + 2)
            rootDirIndexData.writeInt8(0)                    

            const rootDirIndex = serialize.createHeadSector({
                created: Date.now(),
                modified: Date.now(),
                data: rootDirIndexData.buffer,
                next: 0,
                crc32Sum: zlib.crc32(rootDirIndexData.buffer),
                blockRange: 0
            })

            // Root directory content =============================================================

            const rootDirStoreData = Memory.alloc(serialize.STORE_CONTENT)
            const rootDirStore = serialize.createStorageSector({
                data: rootDirStoreData.buffer,
                next: 0,
                crc32Sum: zlib.crc32(rootDirStoreData.buffer),
                blockRange: 0
            })

            // File write =========================================================================

            const initialFile = Buffer.concat([
                rootSector,
                metadataBlock,
                rootDirIndex,
                rootDirStore
            ])

            await fs.writeFile(config.volume, initialFile)

            // File expand stream =================================================================

            // TODO: Use streams to expand the file to the desired volume size.

        } 
        catch (error) {
            return new IBFSError('L0_VCREATE_CANT_CREATE', undefined, error as Error)
        }
    }

}
