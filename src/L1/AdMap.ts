// AdMap (Address Map) is the address space represented by a bitmap
// used to keep track of allocated and free block addresses in bulk
// for an entire volume.

import { Buffer } from 'buffer'

// Types ==========================================================================================

export interface TAdMapInit {
    /** The total number of addresses to keep track of.                                     */ addressCount: number
    /** The offset of the first address to keep track of - must include root & meta blocks. */ offset: number
}

// Export =========================================================================================

export default class AdMap {

    public readonly size: number
    public readonly effectiveSize: number
    public readonly offset: number

    public bitmap: Buffer

    constructor(init: TAdMapInit) {
        this.size = init.addressCount
        this.offset = init.offset
        this.effectiveSize = this.size - this.offset
        this.bitmap = Buffer.alloc(Math.ceil(this.effectiveSize / 8))
    }

    /**
     * Checks if an address is allocated
     * @returns boolean
     */
    public get(address: number): boolean {
        if (address < this.offset || address >= this.effectiveSize) throw new RangeError(`Address [${address}] is out of bounds.`)
        const byteIndex = Math.floor(address / 8)
        const bitOffset = address % 8
        return (this.bitmap[byteIndex]! & (1 << bitOffset)) !== 0
    }

    /**
     * Marks an address as allocated.
     */
    public set(address: number) {
        if (address < this.offset || address >= this.effectiveSize) throw new RangeError(`Address [${address}] is out of bounds.`)
        const byteIndex = Math.floor(address / 8)
        const bitOffset = address % 8
        this.bitmap[byteIndex]! |= (1 << bitOffset)
    }

    /**
     * Marks an address as free.
     */
    public unset(address: number) {
        if (address < this.offset || address >= this.effectiveSize) throw new RangeError(`Address [${address}] is out of bounds.`)
        const byteIndex = Math.floor(address / 8)
        const bitOffset = address % 8
        this.bitmap[byteIndex]! &= ~(1 << bitOffset)
    }

    /**
     * Prints the bitmap as a string of bits for debugging.
     */
    toString() {
        return Array.from(this.bitmap)
            .map(byte => byte.toString(2).padStart(8, '0').split('').reverse().join(''))
            .join('')
    }

}