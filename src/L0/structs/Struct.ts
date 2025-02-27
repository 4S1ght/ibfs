// Imports =============================================================================================================

// Types ===============================================================================================================

// Exports =============================================================================================================

export default class Block {

    protected buffer: Buffer
    protected constructor() {}

    public writeInt8 = (at: number, value: number): number =>
        this.buffer.writeUint8(value, at)

    public writeInt16 = (at: number, value: number): number =>
        this.buffer.writeUint16LE(value, at)

    public writeInt32 = (at: number, value: number): number =>
        this.buffer.writeUInt32LE(value, at)
    

}