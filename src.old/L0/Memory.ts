
/**
 * An abstraction class for allocating/reading buffers and handling their I/O sequentially.
 * This class is here to ease development and omit hardcoding sector metadata indexes inside
 * of serialize/deserialize methods.
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

    /** Wraps an existing buffer and returns a new Memory instance */
    public static wrap(buffer: Buffer) {
        return new this(buffer)
    }
    /** Allocates a portion of memory equal to `size`. */
    public static alloc(size: number) {
        return new this(Buffer.allocUnsafe(size).fill(0))
    }
    /** Allocates a portion of memory equal to `size` without initializing it */
    public static allocUnsafe(size: number) {
        return new this(Buffer.allocUnsafe(size))
    }

    // Misc =========================================================

    /** 
     * Creates a subarray reference of the data that's already been written to the internal buffer.  
     * Depends on the value of the `Memory.bytesWritten` property which can be changed by the user!
     */
    public readFilled() {
        return this.buffer.subarray(0, this.bytesWritten)
    }

    /** 
     * Creates a subarray reference of the remaining data that hasn't yet been read from.
     * Depends in the value of the `Memory.bytesRead` property which can be changed by the user!
     */
    public readRemaining() {
        return this.buffer.subarray(this.bytesRead, this.length)
    }

    // Sequential input =============================================

    /** Sequentially writes an 8-bit integer. */
    public writeInt8(value: number, index?: number) {
         this.buffer.writeUInt8(value, index || this.bytesWritten)
        if (!index) this.bytesWritten += 1
    }
    /** Sequentially writes a 16-bit integer. */
    public writeInt16(value: number, index?: number) {
        this.buffer.writeUInt16LE(value, index || this.bytesWritten)
        if (!index) this.bytesWritten += 2
    }
    /** Sequentially writes a 32-bit integer. */
    public writeInt32(value: number, index?: number) {
        this.buffer.writeUInt32LE(value, index || this.bytesWritten)
        if (!index) this.bytesWritten += 4
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeInt64(value: number, index?: number) {
        this.buffer.writeBigInt64LE(BigInt(value), index || this.bytesWritten)
        if (!index) this.bytesWritten += 8
    }
    /** Sequentially writes a 64-bit integer. (Limited to 52 bits due to float64 / IEEE-754 maximum integer value)  */
    public writeInt64B(value: bigint, index?: number) {
        this.buffer.writeBigInt64LE(value, index || this.bytesWritten)
        if (!index) this.bytesWritten += 8
    }
    /** Sequentially writes a bitwise 0/1 8-bit integer. */
    public writeBool(value: boolean, index?: number) {
        this.buffer.writeUInt8(value ? 1 : 0, index || this.bytesWritten)
        if (!index) this.bytesWritten += 1
    }
    /** Sequentially writes a UTF-8 string. */
    public writeString(value: string, index?: number) {
        const shift = this.buffer.write(value, index || this.bytesWritten, 'utf-8')
        if (!index) this.bytesWritten += shift
    }
    /** Sequentially writes raw data. */
    public write(value: Buffer, index?: number) {
        value.copy(this.buffer, index || this.bytesWritten)
        if (!index) this.bytesWritten += value.length
    }
    /** 
     * Copies N amount of bytes to another `Memory` instance.
     * This can be done fully sequentially, as both the source and target
     * `bytesRead` and `bytesWritten` values are synced respectively.
     */
    public copyTo(target: Memory, length: number): number {
        const copied = this.buffer.copy(
            target.buffer, 
            target.bytesWritten,
            this.bytesRead,
            this.bytesRead + length
        )
        this.bytesRead += copied
        target.bytesWritten += copied
        return copied
    }
    /** Used to initialize a part of memory to 0's. */
    public initialize(start: number, end: number) {
        this.buffer.fill(0, start, end)
    }

    // Sequential output ============================================

    /** Sequentially reads an 8-bit integer. */
    public readInt8(index?: number) {
        const data = this.buffer.readUint8(index || this.bytesRead)
        if (!index) this.bytesRead += 1
        return data
    }
    /** Sequentially reads a 16-bit integer. */
    public readInt16(index?: number) {
        const data = this.buffer.readUint16LE(index || this.bytesRead)
        if (!index) this.bytesRead += 2
        return data
    }
    /** Sequentially reads a 32-bit integer. */
    public readInt32(index?: number) {
        const data = this.buffer.readUint32LE(index || this.bytesRead)
        if (!index) this.bytesRead += 4
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readInt64B(index?: number) {
        const data = this.buffer.readBigInt64LE(index || this.bytesRead)
        if (!index) this.bytesRead += 8
        return data
    }
    /** Sequentially reads a 64-bit integer. */
    public readInt64(index?: number) {
        const data = this.buffer.readBigInt64LE(index || this.bytesRead)
        if (!index) this.bytesRead += 8
        return Number(data)
    }
    /** Sequentially reads an 8-bit bitwise 1/0 integer - Boolean. */
    public readBool(index?: number) {
        const data = this.buffer.readUInt8(index || this.bytesRead)
        if (!index) this.bytesRead += 1
        return Boolean(data)
    }
    /** Sequentially reads a UTF-8 string. */
    public readString(length: number, index?: number) {
        const start = index || this.bytesRead
        const data = this.buffer.subarray(start, start+length).toString('utf-8')
        if (!index) this.bytesRead += length
        return data
    }
    /** 
     * Sequentially reads raw data. 
     * Uses `Buffer.subarray` internally, modifying the content will
     * cause changes to the original buffer due to memory being shared.
    */
    public read(length: number, index?: number) {
        const start = index || this.bytesRead
        const data = this.buffer.subarray(start, start+length)
        if (!index) this.bytesRead += length
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

    /** Returns a new buffer padded to a specific length with zeros. */
    public static padTo = (buffer: Buffer, length: number) => 
        buffer.length > length
            ? Buffer.concat([buffer, Buffer.allocUnsafe(length - buffer.length).fill(0)])
            : buffer
        
}