
/**
 * An abstraction class for allocating/reading parts of memory and handling their I/O sequentially.
 * Random I/O can be achieved through the static methods.
 */
export default class Bytes {

    // Props ==================================================================

    /** Number of bytes written to the internal buffer. */
    public bytesWritten = 0
    /** Number of bytes read from the internal buffer. */
    public bytesRead = 0
    /** Length of the internal buffer. */
    public length: number
    /** The underlying buffer instance. */
    public data: Buffer

    // Class ==================================================================

    private constructor(buffer: Buffer) {
        this.data = buffer
        this.length = buffer.length
    }

    /** Takes in an existing buffer and exposes it under the `Bytes` class' API. */
    public static intake(buffer: Buffer) {
        return new this(buffer)
    }
    /** Allocates a portion of memory equal to `size` and exposes it through the `Bytes` class' API. */
    public static allocate(size: number) {
        return new this(Buffer.allocUnsafe(size).fill(0))
    }
    /** Allocates a portion of memory equal to `size` and exposes it through the `Bytes` class' API. */
    public static allocUnsafe(size: number) {
        return new this(Buffer.allocUnsafe(size))
    }

    // Misc =========================================================

    /** Reads out only the part of the buffer that was written to. */
    public readFilled() {
        return this.data.subarray(0, this.bytesWritten)
    }

    /** Reads out only the part of the buffer that hasn't yet been read from. */
    public readRemaining() {
        return this.data.subarray(this.bytesRead, this.length)
    }

    // Sequential input =============================================

    /** Sequentially writes an 8-bit integer. */
    public writeSeqUInt8(value: number) {
        this.bytesWritten = this.data.writeUInt8(value, this.bytesWritten)
    }
    /** Sequentially writes a 16-bit integer. */
    public writeSeqUInt16(value: number) {
        this.bytesWritten = this.data.writeUInt16LE(value, this.bytesWritten)
    }
    /** Sequentially writes a 32-bit integer. */
    public writeSeqUInt32(value: number) {
        this.bytesWritten = this.data.writeUInt32LE(value, this.bytesWritten)
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeSeqUInt64N(value: number) {
        this.bytesWritten = this.data.writeBigInt64LE(BigInt(value), this.bytesWritten)
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeSeqUInt64(value: bigint) {
        this.bytesWritten = this.data.writeBigInt64LE(value, this.bytesWritten)
    }
    /** Sequentially writes a bitwise 0/1 8-bit integer. */
    public writeSeqBool(value: boolean) {
        this.bytesWritten = this.data.writeUInt8(value ? 1 : 0, this.bytesWritten)
    }
    /** Sequentially writes a UTF-8 string. */
    public writeSeqString(value: string) {
        this.bytesWritten += this.data.write(value, this.bytesWritten, 'utf-8')
    }
    /** Sequentially reads raw data. */
    public writeSeq(value: Buffer) {
        this.data.fill(value, this.bytesWritten, this.bytesWritten + value.length)
        this.bytesWritten += value.length
    }

    // Sequential output ============================================

    /** Sequentially reads an 8-bit integer. */
    public readSeqUInt8() {
        const data = this.data.readUint8(this.bytesRead)
        this.bytesRead += 1
        return data
    }
    /** Sequentially reads a 16-bit integer. */
    public readSeqUInt16() {
        const data = this.data.readUint16LE(this.bytesRead)
        this.bytesRead += 2
        return data
    }
    /** Sequentially reads a 32-bit integer. */
    public readSeqUInt32() {
        const data = this.data.readUint32LE(this.bytesRead)
        this.bytesRead += 4
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readSeqUInt64() {
        const data = this.data.readBigInt64LE(this.bytesRead)
        this.bytesRead += 8
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readSeqUInt64N() {
        const data = this.data.readBigInt64LE(this.bytesRead)
        this.bytesRead += 8
        return Number(data)
    }
    /** Sequentially reads an 8-bit bitwise 1/0 integer - Boolean. */
    public readSeqBool() {
        const data = this.data.readUInt8(this.bytesRead)
        this.bytesRead += 1
        return Boolean(data)
    }
    /** Sequentially reads a UTF-8 string. */
    public readSeqString(length: number) {
        const data = this.data.subarray(this.bytesRead, this.bytesRead + length).toString('utf-8')
        this.bytesRead += length
        return data
    }
    /** Sequentially reads raw data. */
    public readSeq(length: number) {
        const data = this.data.subarray(this.bytesRead, this.bytesRead + length)
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