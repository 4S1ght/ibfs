
/**
 * An abstraction class for allocating/reading buffers and handling their I/O sequentially.
 * This class is here to ease development and omit hardcoding sector metadata indexes inside
 * of serialize/deserialize methods.
 * Random I/O can be achieved through the static methods.
 */
export default class Memory {

    // Props ==================================================================

    /** Number of bytes written to the internal buffer. */
    public bytesWritten = 0
    /** Number of bytes read from the internal buffer. */
    public bytesRead = 0
    /** Length of the internal buffer. */
    public length: number
    /** The underlying buffer instance. */
    public buffer: Buffer

    // Class ==================================================================

    private constructor(buffer: Buffer) {
        this.buffer = buffer
        this.length = buffer.length
    }

    /** Takes in an existing buffer and exposes it under the `Bytes` class' API. */
    public static intake(buffer: Buffer) {
        return new this(buffer)
    }
    /** Allocates a portion of memory equal to `size` and exposes it through the `Bytes` class' API. */
    public static alloc(size: number) {
        return new this(Buffer.allocUnsafe(size).fill(0))
    }
    /** Allocates a portion of memory equal to `size` and exposes it through the `Bytes` class' API. */
    public static allocUnsafe(size: number) {
        return new this(Buffer.allocUnsafe(size))
    }

    // Misc =========================================================

    /** Reads out only the part of the buffer that was written to. */
    public readFilled() {
        return this.buffer.subarray(0, this.bytesWritten)
    }

    /** Reads out only the part of the buffer that hasn't yet been read from. */
    public readRemaining() {
        return this.buffer.subarray(this.bytesRead, this.length)
    }

    // Sequential input =============================================

    /** Sequentially writes an 8-bit integer. */
    public writeInt8(value: number) {
        this.bytesWritten = this.buffer.writeUInt8(value, this.bytesWritten)
    }
    /** Sequentially writes a 16-bit integer. */
    public writeInt16(value: number) {
        this.bytesWritten = this.buffer.writeUInt16LE(value, this.bytesWritten)
    }
    /** Sequentially writes a 32-bit integer. */
    public writeInt32(value: number) {
        this.bytesWritten = this.buffer.writeUInt32LE(value, this.bytesWritten)
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeInt64(value: number) {
        this.bytesWritten = this.buffer.writeBigInt64LE(BigInt(value), this.bytesWritten)
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeInt64B(value: bigint) {
        this.bytesWritten = this.buffer.writeBigInt64LE(value, this.bytesWritten)
    }
    /** Sequentially writes a bitwise 0/1 8-bit integer. */
    public writeBool(value: boolean) {
        this.bytesWritten = this.buffer.writeUInt8(value ? 1 : 0, this.bytesWritten)
    }
    /** Sequentially writes a UTF-8 string. */
    public writeString(value: string) {
        this.bytesWritten += this.buffer.write(value, this.bytesWritten, 'utf-8')
    }
    /** Sequentially writes raw data. */
    public write(value: Buffer) {
        value.copy(this.buffer, this.bytesWritten)
        this.bytesWritten += value.length
    }

    // Sequential output ============================================

    /** Sequentially reads an 8-bit integer. */
    public readInt8() {
        const data = this.buffer.readUint8(this.bytesRead)
        this.bytesRead += 1
        return data
    }
    /** Sequentially reads a 16-bit integer. */
    public readInt16() {
        const data = this.buffer.readUint16LE(this.bytesRead)
        this.bytesRead += 2
        return data
    }
    /** Sequentially reads a 32-bit integer. */
    public readInt32() {
        const data = this.buffer.readUint32LE(this.bytesRead)
        this.bytesRead += 4
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readInt64B() {
        const data = this.buffer.readBigInt64LE(this.bytesRead)
        this.bytesRead += 8
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readInt64() {
        const data = this.buffer.readBigInt64LE(this.bytesRead)
        this.bytesRead += 8
        return Number(data)
    }
    /** Sequentially reads an 8-bit bitwise 1/0 integer - Boolean. */
    public readBool() {
        const data = this.buffer.readUInt8(this.bytesRead)
        this.bytesRead += 1
        return Boolean(data)
    }
    /** Sequentially reads a UTF-8 string. */
    public readString(length: number) {
        const data = this.buffer.subarray(this.bytesRead, this.bytesRead + length).toString('utf-8')
        this.bytesRead += length
        return data
    }
    /** 
     * Sequentially reads raw data. 
     * Uses `Buffer.subarray` internally, modifying the content will
     * cause changes to the original buffer due to shared memory.
    */
    public read(length: number) {
        const data = this.buffer.subarray(this.bytesRead, this.bytesRead + length)
        this.bytesRead += length
        return data
    }

    // Utilities ====================================================

    /**
     * Filters out all multi-byte characters like emojis, mathematical 
     * symbols and alike for storing text in fixed length buffers.
     */
    public static filterMultibyteUTF8Chars = (string: string) =>
        string.length !== Buffer.byteLength(string)
            ? string.split('').filter(char => char.charCodeAt(0) <= 127).join('')
            : string

    /** Adds 0-filled padding at the end of the buffer. */
    public static toLength = (length: number, buffer: Buffer) => 
        buffer.length > length
            ? Buffer.concat([buffer, Buffer.allocUnsafe(length - buffer.length).fill(0)])
            : buffer
        
}