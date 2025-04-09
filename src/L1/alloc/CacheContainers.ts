// Imports =============================================================================================================

import type * as T  from '../../../types.js'

import crypto       from 'node:crypto'
import fs           from 'node:fs/promises'

import Memory       from '../../L0/Memory.js'
import UUID         from '../../misc/uuid.js'

// Types ===============================================================================================================

export type TCCCipher = 'aes-128-gcm' | 'aes-256-gcm'
export type TCCCipherOpt = TCCCipher | 'none'

export interface TCreateCacheContainer {
    bitmap: Buffer
    cipher: TCCCipherOpt
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
        16     | 16B  | Buffer | AES IV
        32     | 16B  | Buffer | Auth Tag
        48     | 8B   | Number | Length of the address space bitmap (after decryption)
        56-128 | ---- | ------ | --------------------- Reserved -----------------------
        129-N  | N    | Body   | Address space bitmap
    
     */
    public static serialize(options: TCreateCacheContainer) {
        
        const length = options.bitmap.length
        const bodyPadding = 16 - (length % 16)
        const bodySize = length + bodyPadding
        const totalSize = 128 + bodySize

        const mem = Memory.alloc(totalSize)
        const iv = crypto.randomBytes(16)
        const uuid = UUID.fromString(options.volumeUUID)
        let authTag = Buffer.alloc(16)

        const encrypt = options.cipher === 'none' 
            ? (data: Buffer) => data
            : (data: Buffer) => {
                const key = options.key.subarray(0, options.cipher === 'aes-128-gcm' ? 16 : 32)
                const cipher = crypto.createCipheriv(options.cipher as TCCCipher, options.key, iv)
                const pos = cipher.update(data).copy(data, 0)
                            cipher.final().copy(data, pos)
                authTag = cipher.getAuthTag()
                return data
            }

        mem.write(uuid)
        mem.write(iv)
        mem.write(authTag),
        mem.writeInt64(length)
        mem.write(encrypt(options.bitmap))

        return mem.buffer

    }

    /**
     * Decrypts and deserializes a cached address space bitmap from the disk.  
     * Reuses the the first o the AES/XTS encryption key used by the volume internally.
     */
    public static deserialize(buf: Buffer, cipher: TCCCipherOpt, aesKey: Buffer) {

        const mem = Memory.wrap(buf)

        const uuid       = mem.readString(16)
        const iv         = mem.read(16)
        const authTag    = mem.read(16)
        const bodyLength = mem.readInt64()
        const encrypted  = mem.readRemaining()

        const decrypt = cipher === 'none' 
            ? (data: Buffer) => data
            : (data: Buffer) => {
                const key = aesKey.subarray(0, cipher === 'aes-128-gcm' ? 16 : 32)
                const decipher = crypto.createDecipheriv(cipher as TCCCipher, key, iv).setAuthTag(authTag)
                const pos = decipher.update(data).copy(data, 0)
                            decipher.final().copy(data, pos)
                return data
            }
        
        return {
            bitmap: decrypt(encrypted.subarray(0, bodyLength)),
            volumeUUID: uuid
        }

    }

}