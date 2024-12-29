// Imports ========================================================================================

import IBFSError from '../../errors/IBFSError.js'
import type AES from '../AES.js'

// Types ==========================================================================================

type ResourceType = 'file' | 'directory'

export interface THeadBlock {
    /** Created timestamp (seconds) */
    created: number
    /** Modified timestamp (seconds) */
    modified: number
    /** Next block address */
    next: number
    /** Resource type - Either a directory (0) or a file (1) */
    resourceType: ResourceType
    /** Block data */
    addresses: number[]
}

interface TCreateMeta {
    size: number
}

// Exports ========================================================================================

/**
    Index | Size  | Type   | Description
    ------|-------|--------|-----------------------------------------------
    0     | 1B    | int8   | Block type (0x00 - head)
    1     | 4B    | int32  | CRC body checksum
    5     | 8B    | int64  | Created timestamp
    13    | 8B    | int64  | Modified timestamp
    21    | 8B    | int64  | Next block address (0: none)
    29    | 1B    | int8   | Resource type (0: directory, 1: file)
    30    | 4B    | int32  | Body size - Amount of actual data stored
    30    | 16B   | buffer | Block data
*/
export default class HeadBlock implements THeadBlock {

    public static readonly HEADER_SIZE = 64

    // Internal =====================================================

    private declare buffer: Buffer

    // Methods =====================================================

    private constructor() {}

    public static create(block: THeadBlock & TCreateMeta) {

        const self = new this()
        self.buffer = Buffer.allocUnsafe(block.size)
        self.buffer.fill(0, 0, HeadBlock.HEADER_SIZE)

    }

    public static from(buffer: Buffer): HeadBlock {
        const self = new this()
        self.buffer = buffer
        return self
    }

    /** 
     * Prepares the head block for interaction.  
     * Decrypts contents and checks integrity.
     * @param integrity - Whether or not to check the integrity of the block (should be disabled only for recovery)
     */
    public prepare(aes: AES, address: number, key: Buffer, integrity = true) {
        const body = this.buffer.subarray(HeadBlock.HEADER_SIZE)
        const crc = aes.decryptCRC(body, key, address)
        if (integrity && crc !== this.crc32Sum) throw new IBFSError('L0_BIN_HEAD_INTEGRITY')
    }

    /**
     * Finalizes the head block's state.
     * Adds any necessary padding to the end of the block to make mask any leftover
     * uninitialized memory, checksums the content and encrypts it.
     * Any further modifications to the head block's body after calling this function
     * will lead to ciphertext **corruption**!
     */
    public finalize(aes: AES, address: number, key: Buffer) {

        // Cover uninitialized memory
        const padding = this.buffer.length - HeadBlock.HEADER_SIZE - this.bodySize
        if (padding > 0) this.buffer.fill(0, HeadBlock.HEADER_SIZE + this.bodySize)

        const body = this.buffer.subarray(HeadBlock.HEADER_SIZE)
        this.crc32Sum = aes.encryptCRC(body, key, address)
    }

    // Properties ===================================================

    public  get blockType() { return this.buffer.readUInt8(0) }
    private set blockType(value: number) { this.buffer.writeInt8(value) }

    public  get crc32Sum() { return this.buffer.readUInt32LE(1) }
    private set crc32Sum(value: number) { this.buffer.writeUInt32LE(value,1) }

    public get created() { return Number(this.buffer.readBigInt64LE(5)) }
    public set created(value: number) { this.buffer.writeBigInt64LE(BigInt(value), 5) }

    public get modified() { return Number(this.buffer.readBigInt64LE(13)) }
    public set modified(value: number) { this.buffer.writeBigInt64LE(BigInt(value), 13) }

    public get next() { return Number(this.buffer.readBigInt64LE(21)) }
    public set next(value: number) { this.buffer.writeBigInt64LE(BigInt(value), 21) }

    public get resourceType() { return (['directory', 'file'] as const)[this.buffer.readUInt8(29)] }
    public set resourceType(value: ResourceType) { this.buffer.writeUInt8(['directory', 'file'].indexOf(value), 29) }

    public  get bodySize() { return this.buffer.readUInt32LE(30) }
    private set bodySize(value: number) { this.buffer.writeUInt32LE(value, 30) }

    public get addresses() {
        const addressCount = this.bodySize / 8
        const addresses = new Array<number>(addressCount)
        for (let i = 0; i < addressCount; i++) 
            addresses[i] = Number(this.buffer.readBigInt64LE(HeadBlock.HEADER_SIZE + i*8))
        return addresses
    }

    public set addresses(addresses: number[]) {
        const addressCount = addresses.length
        const bodySize = addressCount * 8
        if (bodySize > this.buffer.length - HeadBlock.HEADER_SIZE) throw new IBFSError('L0_BIN_HEAD_SEGFAULT')
        this.bodySize = bodySize
        for (let i = 0; i < addressCount; i++) 
            this.buffer.writeBigInt64LE(BigInt(addresses[i]), HeadBlock.HEADER_SIZE + i*8)
    }

}
