// Imports =============================================================================================================

import type * as T  from '../../../types.js'

import crypto       from 'node:crypto'
import fs           from 'node:fs/promises'

import Memory       from '../../L0/Memory.js'
import UUID         from '../../misc/uuid.js'

// Types ===============================================================================================================

export type TGCMCipher = 'aes-128-gcm' | 'aes-256-gcm'
export type TGCMCipherOpt = TGCMCipher | 'none'

export interface TCreateCacheContainer {
    bitmap: Buffer
    cipher: TGCMCipherOpt
    key: Buffer
    volumeUUID: string
}

// Exports =============================================================================================================

export default class CacheContainer {

    /** 
     * Loads a cached address space bitmap from the disk.
     * 
     * Uses encryption internally as to not expose the allocation state of 
     * an encrypted volume.
     * 
     * This function reuses the first half of the volume's encryption key.  
     * This portion is extracted internally so the full original key can  
     * be used to encrypt and decrypt the contents.
     * 
        Index  | Size | Type   | Description
        -------|------|--------|-------------------------------------------------------
        0      | 16B  | UUID   | UUID of the associated volume
        16     | 12B  | Buffer | AES IV
        28     | 16B  | Buffer | Auth Tag
        44     | 8B   | Number | Length of the address space bitmap (after decryption)
        52-128 | ---- | ------ | --------------------- Reserved -----------------------
        129-N  | N    | Body   | Address space bitmap
    
     */
    public static serialize(options: TCreateCacheContainer) {

        const mem  = Memory.alloc(128 + options.bitmap.length)
        const iv   = crypto.randomBytes(12)
        const uuid = UUID.fromString(options.volumeUUID)

        const key = options.key.subarray(0, options.cipher === 'aes-128-gcm' ? 16 : 32)
        const { ciphertext, authTag } = this.encrypt(options.bitmap, key, iv, options.cipher)

        mem.write(uuid)
        mem.write(iv)
        mem.write(authTag)
        mem.writeInt64(options.bitmap.length)
        mem.bytesWritten = 128
        mem.write(ciphertext)

        return mem.buffer

    }

    /**
     * Decrypts and deserializes a cached address space bitmap from the disk.  
     * Reuses the the first o the AES/XTS encryption key used by the volume internally.
     */
    public static deserialize(buf: Buffer, cipher: TGCMCipherOpt, aesKey: Buffer) {

        const mem = Memory.wrap(buf)

        const uuid       = UUID.toString(mem.read(16))
        const iv         = mem.read(12)
        const authTag    = mem.read(16)
        const bodyLength = mem.readInt64()
        mem.bytesRead    = 128
        const encrypted  = mem.readRemaining()

        const key = aesKey.subarray(0, cipher === 'aes-128-gcm' ? 16 : 32)
        const decrypted = this.decrypt(encrypted, key, iv, authTag, cipher)
        
        return {
            bitmap: decrypted.subarray(bodyLength),
            volumeUUID: uuid
        }

    }

    private static encrypt(payload: Buffer, aesKey: Buffer, iv: Buffer, aesCipher: TGCMCipherOpt) {

        if (aesCipher === 'none') return { ciphertext: payload, authTag: Buffer.alloc(16) }

        const key = aesKey.subarray(0, aesCipher === 'aes-128-gcm' ? 16 : 32)
        const cipher = crypto.createCipheriv(aesCipher as TGCMCipher, key, iv)
        const ciphertext = Buffer.concat([
            cipher.update(payload),
            cipher.final()
        ])
        const authTag = cipher.getAuthTag()

        return { ciphertext, authTag }

    }

    private static decrypt(ciphertext: Buffer, aesKey: Buffer, iv: Buffer, authTag: Buffer, aesCipher: TGCMCipherOpt) {

        if (aesCipher === 'none') return ciphertext

        const key = aesKey.subarray(0, aesCipher === 'aes-128-gcm' ? 16 : 32)
        const decipher = crypto.createDecipheriv(aesCipher as TGCMCipher, key, iv)
        decipher.setAuthTag(authTag)

        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ])

    }

}