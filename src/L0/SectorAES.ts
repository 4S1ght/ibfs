// Imports ====================================================================

import crypto from 'node:crypto'

// Types & Constants ==========================================================

type SectorSize = typeof SectorAES.SECTOR_SIZES[number]
type AESKeySize = typeof SectorAES.AES_KEY_SIZES[number]

export enum AESCipher {
    ''            = 0,
    'aes-128-xts' = 128,
    'aes-256-xts' = 256,
}

interface SectorAESConfig {
    /**
     * AES/XTS cipher used. Enter empty string for no encryption. 
     */
    aesCipher: keyof typeof AESCipher
    /** 
     * 8-byte initialization vector provided from the volume's metadata.  
     * This value is combined with an 8-byte sector address to simulate
     * sector tweak values.
     */
    aesIV: Buffer
}

// Module =====================================================================

export default class SectorAES {

    public static readonly SECTOR_SIZES  = [ 1024, 2048, 4096, 8192, 16384, 32768 ] as const
    public static readonly AES_KEY_SIZES = [ 0, 128, 256 ] as const

    public readonly iv: Buffer
    public readonly cipher: keyof typeof AESCipher

    /** Combines 8-byte IV with 8-byte sector address to emulate tweak values. */
    public workingIV = Buffer.alloc(16)

    constructor(config: SectorAESConfig) {

        this.iv = config.aesIV
        this.cipher = config.aesCipher

        this.workingIV.fill(this.iv, 0, 8)

        // Overwrite encrypt/decrypt methods if no encryption is being used
        // instead of checking if it's enabled each time a sector is processed.
        if (config.aesCipher === '') {
            this.encrypt = (buf) => buf
            this.decrypt = (buf) => buf
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
    private encrypt(input: Buffer, key: Buffer, address: number) {
        const iv = this.getIV(address)
        const cipher = crypto.createCipheriv(this.cipher, key, iv)
        const pos = cipher.update(input).copy(input, 0)
                    cipher.final().copy(input, pos)
        return input
    }

    /**
     * Decrypts the `input` data and copies it back over to the same `input` 
     * buffer in order to reuse already allocated memory.
     * Returns the `input` buffer for convenience.
     * @param encrypted Encrypted sector bytes
     * @param key Encryption/decryption key
     * @param address Sector address
     */
    private decrypt(input: Buffer, key: Buffer, address: number) {
        const iv = this.getIV(address)
        const decipher = crypto.createDecipheriv(this.cipher, key, iv)
        const pos = decipher.update(input).copy(input, 0)
                    decipher.final().copy(input, pos)
        return input
    }



}