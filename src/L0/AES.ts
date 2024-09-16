// Imports ========================================================================================

import crypto from 'node:crypto'
import zlib from 'node:zlib'

// Types & Constants ==============================================================================

export type AESKeySize = typeof BlockAES.AES_KEY_SIZES[number]

export enum AESCipher {
    ''            = 0,
    'aes-128-xts' = 128,
    'aes-256-xts' = 256,
}

export interface BlockAESConfig {
    /**
     * AES/XTS cipher used. Enter empty string for no encryption. 
     */
    cipher: keyof typeof AESCipher
    /** 
     * 8-byte initialization vector provided from the volume's metadata.  
     * This value is combined with an 8-byte sector address to simulate
     * sector tweak values.
     */
    iv: Buffer
}

// Module =========================================================================================

export default class BlockAES {

    public static readonly AES_KEY_SIZES = [ 0, 128, 256 ] as const

    public readonly iv: Buffer
    public readonly cipher: keyof typeof AESCipher

    /** Combines 8-byte IV with 8-byte sector address to emulate tweak values. */
    public workingIV = Buffer.alloc(16)

    constructor(config: BlockAESConfig) {

        this.iv = config.iv
        this.cipher = config.cipher
        this.workingIV.fill(this.iv, 0, 8)

        // Overwrite encrypt/decrypt methods if no encryption is being used
        // instead of checking if it's enabled each time a sector is processed.
        if (config.cipher === '') {
            this.encrypt = (buf) => buf
            this.decrypt = (buf) => buf
            this.decryptCRC = (buf, key, addr, crcValue) => zlib.crc32(buf, crcValue)
            this.encryptCRC = (buf, key, addr, crcValue) => zlib.crc32(buf, crcValue)
        }

    }

    /**
     * Creates a unique IV (initialization vector) for a specific sector.
     * Combines an 8-byte static IV generated during volume initialization
     * with an 8-byte sector address.
     */
    private getIV(address: number): Buffer {
        this.workingIV.writeBigUint64LE(BigInt(address), 8)
        return this.workingIV
    }

    /**
     * Encrypts the `input` data and copies it back over to the same `input` 
     * buffer in order to reuse already allocated memory.
     * Returns the `input` buffer for convenience.
     * @param input Unencrypted sector bytes
     * @param key Encryption/decryption key
     * @param address Sector address
     */
    public encrypt(input: Buffer, key: Buffer, address: number) {
        const iv = this.getIV(address)
        const cipher = crypto.createCipheriv(this.cipher, key, iv)
        const pos = cipher.update(input).copy(input, 0)
                    cipher.final().copy(input, pos)
        return input
    }

    /**
     * Encrypts the `input` data and copies it back over to the same `input` 
     * buffer in order to reuse already allocated memory.
     * Returns the CRC-32 checksum of the original buffer after decryption.
     * @param input Unencrypted sector bytes
     * @param key Encryption/decryption key
     * @param address Sector address
     */
    public encryptCRC(input: Buffer, key: Buffer, address: number, crcValue?: number) {
        const iv = this.getIV(address)
        const cipher = crypto.createCipheriv(this.cipher, key, iv)
        const pos = cipher.update(input).copy(input, 0)
                    cipher.final().copy(input, pos)

        return zlib.crc32(input, crcValue)
    }

    /**
     * Decrypts the `input` data and copies it back over to the same `input` 
     * buffer in order to reuse already allocated memory.
     * Returns the `input` buffer for convenience.
     * @param encrypted Encrypted sector bytes
     * @param key Encryption/decryption key
     * @param address Sector address
     */
    public decrypt(input: Buffer, key: Buffer, address: number) {
        const iv = this.getIV(address)
        const decipher = crypto.createDecipheriv(this.cipher, key, iv)
        const pos = decipher.update(input).copy(input, 0)
                    decipher.final().copy(input, pos)
        return input
    }

    /**
     * Decrypts the `input` data and copies it back over to the same `input` 
     * buffer in order to reuse already allocated memory.
     * Returns the CRC-32 checksum of the original buffer before decryption.
     * @param encrypted Encrypted sector bytes
     * @param key Encryption/decryption key
     * @param address Sector address
     */
    public decryptCRC(input: Buffer, key: Buffer, address: number, crcValue?: number) {
        const crc = zlib.crc32(input, crcValue)
        const iv = this.getIV(address)
        const decipher = crypto.createDecipheriv(this.cipher, key, iv)
        const pos = decipher.update(input).copy(input, 0)
                    decipher.final().copy(input, pos)
                
        return crc
    }

    // Static ===================================

    /**
     * Digests a user provided AES encryption key to produce
     * a constant length SHA-256 hash that can be used internally by
     * the IBFS driver.
     * @param key User-provided AES key
     * @returns SHA-256 digest
     */
    public static derive256BitAESKey(key: string | Buffer): Buffer {
        return crypto.createHash('sha256').update(key).digest()
    }

    /**
     * Digests a user provided AES encryption key to produce
     * a constant length SHA-512 hash that can be used internally by
     * the IBFS driver.
     * @param key User-provided AES key
     * @returns SHA-512 digest
     */
    public static derive512BitAESKey(key: string | Buffer): Buffer {
        return crypto.createHash('sha512').update(key).digest()
    }

}