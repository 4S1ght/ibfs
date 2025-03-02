// Imports ========================================================================================

import type * as T from '../../types.js'

import crypto      from 'node:crypto'
import IBFSError   from '../errors/IBFSError.js'

// Types & Constants ==============================================================================

export type TAESCipher = 'none' | 'aes-128-xts' | 'aes-256-xts'

export interface TAESConfig {
    /**
     * AES/XTS cipher used. Enter empty string for no encryption. 
     */
    cipher: TAESCipher
    /** 
     * 8-byte initialization vector provided from the volume's metadata.  
     * This value is combined with an 8-byte sector address to simulate
     * sector tweak values.
     */
    iv: Buffer

}

// Exports ========================================================================================

export default class BlockAESContext {

    public readonly iv: Buffer
    public readonly cipher: TAESCipher

    /** Combines 8-byte IV with 8-byte sector address to emulate tweak values. */
    public readonly workingIV = Buffer.alloc(16)

    constructor(config: TAESConfig) {

        this.iv = config.iv
        this.cipher = config.cipher
        this.workingIV.fill(this.iv, 0, 8)

        // Overwrite encrypt/decrypt methods if no encryption is being used
        // instead of checking if it's enabled each time a sector is processed.
        if (config.cipher === 'none') {
            this.encrypt = (buf) => buf
            this.decrypt = (buf) => buf
        }

    }
    
    /**
     * Creates a unique initialization vector for a specific sector.
     * Combines an 8-byte static IV generated during volume initialization
     * with an 8-byte sector address.
     */
    private getIV(address: number): Buffer {
        this.workingIV.writeBigInt64BE(BigInt(address), 8)
        return this.workingIV
    }

    /**
     * Encrypts the `input` data and copies it back over to the same `input` buffer.
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
     * Decrypts the `input` data and copies it back over to the same `input` buffer.
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

    // Static ===================================

    /**
     * Digests a user provided AES encryption key to produce
     * a constant length SHA-256 hash that can be used internally by
     * the IBFS driver.
     * @param key User-provided AES key
     * @returns SHA-256 digest
     */
    private static derive256BitAESKey(key: string | Buffer): Buffer {
        return crypto.createHash('sha256').update(key).digest()
    }

    /**
     * Digests a user provided AES encryption key to produce
     * a constant length SHA-512 hash that can be used internally by
     * the IBFS driver.
     * @param key User-provided AES key
     * @returns SHA-512 digest
     */
    private static derive512BitAESKey(key: string | Buffer): Buffer {
        return crypto.createHash('sha512').update(key).digest()
    }

    /**
     * Given an encryption algorithm the method digests a user-provided key using a `SHA-256` or `SHA-512`
     * hashing algorithm to match key sizes required for respective encryption types.
     * @param cipher AES cipher used (leave empty for no encryption key)
     * @param key encryption key
     * @returns [Error | Key]
     */
    public static deriveAESKey(cipher: TAESCipher, key: string | Buffer | undefined): 
        T.XEav<Buffer, 'L0_AES_NOKEY'|'L0_AES_KEYDIGEST'> {
        try {
            if (cipher && !key) throw new IBFSError(
                'L0_AES_NOKEY', 
                `Volume created in ${cipher} mode requires an AES key that was ` +
                `not provided or is of a wrong type (${typeof key}).`
            )
            const ciphers = {
                'aes-128-xts': () => this.derive256BitAESKey(key!),
                'aes-256-xts': () => this.derive512BitAESKey(key!),
                'none':        () => Buffer.alloc(0)
            } as const
            return [null, ciphers[cipher]()]
        } 
        catch (error) {
            return [new IBFSError('L0_AES_KEYDIGEST', null, error as Error), null]
        }
    }

}