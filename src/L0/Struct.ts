// Imports =============================================================================================================

// Types ===============================================================================================================

// Exports =============================================================================================================

export default class Struct {

    public buffer: Buffer

    protected constructor(buffer: Buffer) {
        this.buffer = buffer
    }

    // Factory Methods ----------------------------------------------

    public static wrap(buffer: Buffer) {
        return new this(buffer)
    }

    public static allocUnsafe(size: number) {
        return new this(Buffer.allocUnsafe(size))
    }

    public static alloc(size: number) {
        return new this(Buffer.allocUnsafe(size).fill(0))
    }

    // Writes -------------------------------------------------------

    public writeInt8 = (at: number, value: number): number =>
        this.buffer.writeUint8(value, at)

    public writeInt16 = (at: number, value: number): number =>
        this.buffer.writeUint16LE(value, at)

    public writeInt32 = (at: number, value: number): number =>
        this.buffer.writeUInt32LE(value, at)

    public writeInt64 = (at: number, value: number): number =>
        this.buffer.writeBigInt64LE(BigInt(value), at)

    public writeInt64B = (at: number, value: bigint): number =>
        this.buffer.writeBigInt64LE(value, at)

    public writeBool = (at: number, value: boolean): number =>
        this.buffer.writeUInt8(value ? 1 : 0, at)

    public writeString = (at: number, value: string): number =>
        at + this.buffer.write(value, at, 'utf-8')

    public write = (at: number, value: Buffer): number =>
        at + value.copy(this.buffer, at)

    public initialize = (start: number, end: number) =>
        this.buffer.fill(0, start, end)

    public initializeRight = (start: number) => 
        this.initialize(start, this.buffer.length)
    
    // Reads --------------------------------------------------------

    public readInt8 = (at: number): number =>
        this.buffer.readUInt8(at)

    public readInt16 = (at: number): number =>
        this.buffer.readUInt16LE(at)

    public readInt32 = (at: number): number =>
        this.buffer.readUInt32LE(at)

    public readInt64 = (at: number): number =>
        Number(this.buffer.readBigInt64LE(at))

    public readInt64B = (at: number): bigint =>
        this.buffer.readBigInt64LE(at)

    public readBool = (at: number): boolean =>
        this.buffer.readUInt8(at) === 1

    public readString = (at: number, length: number): string =>
        this.buffer.subarray(at, length).toString('utf-8')

    public read = (at: number, length: number): Buffer =>
        this.buffer.subarray(at, length)

}