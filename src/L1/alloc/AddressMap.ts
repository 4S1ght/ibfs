// AddressMap is the address space represented by a bitmap
// used to keep track of block allocation of the entire volume.

import { Buffer } from "node:buffer"
import IBFSError from "../../errors/IBFSError.js"

// Types ==========================================================================================

export interface TAddressMapInit {
    /** The size if the internal address bitmap                       */ size:   number
    /** The offset used to take N first blocks out of the alloc pool. */ offset: number
}

// Exports ========================================================================================

export default class AddressMap {

    public readonly size: number
    public readonly offset: number

    private readonly bitmap: Buffer

    constructor(init: TAddressMapInit) {
        this.size = init.size
        this.offset = init.offset
        this.bitmap = Buffer.alloc(Math.ceil((this.size - this.offset) / 8))
    }

    /** 
     * Translates the physical block address to a bitmap index using the 
     * configured offset and checks for out of bounds cases.
    */
    private translateOffset(address: number): number {
        const offsetAddress = address - this.offset
        if (offsetAddress < 0 || offsetAddress >= this.size) {
            throw new IBFSError(
                'L1_AM_ADDRESS_OUT_OF_RANGE', 
                `Address ${address} is out of range.`, 
                null, 
                { size: this.size, offset: this.offset }
            )
        }
        return offsetAddress
    }

    /** Returns `true` if the address is taken. */
    public isTaken(address: number): boolean {
        const offsetAddress = this.translateOffset(address)
        const byteIndex = Math.floor(offsetAddress / 8)
        const bitOffset = offsetAddress % 8
        return (this.bitmap[byteIndex]! & (1 << bitOffset)) !== 0
    }

    /** Marks an address as allocated. */
    public markAllocated(address: number) {
        const offsetAddress = this.translateOffset(address)
        const byteIndex = Math.floor(offsetAddress / 8)
        const bitOffset = offsetAddress % 8
        this.bitmap[byteIndex]! |= (1 << bitOffset)
    }

    /** Marks an address as free. */
    protected markFree(address: number) {
        const offsetAddress = this.translateOffset(address)
        const byteIndex = Math.floor(offsetAddress / 8)
        const bitOffset = offsetAddress % 8
        this.bitmap[byteIndex]! &= ~(1 << bitOffset)
    }

    /** Prints the bitmap as a string of bits for debugging. */
    public toString() {
        return Array.from(this.bitmap)
            .map(byte => byte.toString(2).padStart(8, '0').split('').reverse().join(''))
            .join('')
    }

}