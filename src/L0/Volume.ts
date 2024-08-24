/// <reference path="../types.d.ts"/>
// Imports ====================================================================

import path from "node:path"
import fs from "node:fs/promises"
import crypto from "node:crypto"

import Memory from "./Memory.js"
import SectorSerialize, { SectorSize } from "./SectorSerialize.js"
import SectorAES, { AESCipher } from "./SectorAES.js"
import IBFSError from "../errors/IBFSError.js"
import { FS_SPEC } from '../Constants.js'

// Types ======================================================================

export interface VolumeCreateConfig {
    sectorSize: SectorSize
    sectorCount: number
    aesCipher: keyof typeof AESCipher
    aesKey: Buffer | string
}

// Module =====================================================================

export default class Volume {

    private constructor() {}

    public static async create(config: VolumeCreateConfig): EavSingleAsync<IBFSError> {
        try {

            // Metadata
            const metadataSectors = Math.ceil(1024*1024 / config.sectorSize)
            const metadata = Buffer.from(JSON.stringify({ ibfs: {} }))

            // Creates the key check buffer used later to verify the correctness of
            // user supplied decryption key.
            const aesKeyCheck = (() => {
                if (config.aesCipher === '') return Buffer.alloc(16)
                // Parse key
                const key = Buffer.alloc({ 'aes-128-xts': 32, 'aes-256-xts': 64}[config.aesCipher])
                Buffer.from(config.aesKey).copy(key)
                // Encrypt
                const aes = new SectorAES({ cipher: config.aesCipher, iv: Buffer.alloc(16) })
                return aes.encrypt(Buffer.alloc(16), key, 0)
            })()

            // Root sector
            const rs = SectorSerialize.createRootSector({
                specMajor:              FS_SPEC[0],
                specMinor:              FS_SPEC[1],
                sectorSize:             config.sectorSize,
                sectorCount:            config.sectorCount,
                metadataSectors:        metadataSectors,
                aesCipher:              AESCipher[config.aesCipher],
                aesIV:                  crypto.randomBytes(16),
                nodeCryptoCompatMode:   true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          metadataSectors + 1
            })

            const serialize = new SectorSerialize({ sectorSize: config.sectorSize })
            // TODO const rootDir = serialize.createHeadSector({}) 
            

        } 
        catch (error) {
            return new IBFSError('L0_CREATE_CANT_CREATE', undefined, error as Error)
        }
    }

}