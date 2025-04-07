// AddressSpace is responsible for providing a caching
// Layer on top of the underlying address bitmap that keeps track
// of resource allocation inside the volume.

// Imports =============================================================================================================

import * as T from "../../../types.js"

import fs from "node:fs/promises"

import IBFSError from "../../errors/IBFSError.js"
import AddressMap, { TAddressMapInit } from "./AddressMap.js"

// Types ===============================================================================================================

export interface TAddressSpaceInit extends TAddressMapInit {
    /** The number of addresses cached at a time. */ cacheSize: number
}

// Exports =============================================================================================================

export default class AddressSpace extends AddressMap {

    private readonly cache: Array<number | undefined>
    private cacheHealth = -1
    
    private replRegions: number
    private replCycle: Generator<number>

    constructor(init: TAddressSpaceInit) {
        super(init)
        this.cache = new Array(init.cacheSize).fill(undefined)
        this.replRegions = Math.ceil(init.size / init.cacheSize)
        this.replCycle = AddressSpace.createCycle(this.replRegions)
    }

    // Primary API -----------------------------------------------------------------------------------------------------

    /**
     * Allocates an address.  
     * 
     * **Note** that this address **MUST** be freed back if it's no
     * longer used or else it will leak. This will lead to loss
     * of allocatable disk space until the driver is restarted
     * and the volume is re-scanned for free space.
     * 
     * @returns an address that's been allocated.
     * @throws L1_ALLOC_ADDRESS_EXHAUSTION
     */
    public alloc(): number {
        if (this.cacheHealth === -1) this.fastReplenish()
        const address = this.cache[this.cacheHealth]!
        this.cache[this.cacheHealth] = undefined
        this.cacheHealth--
        return address
    } 

    public free(address: number): void {
        this.markFree(address)
    }

    // Internals -------------------------------------------------------------------------------------------------------

    /**
     * Replenishes the cache using a quick replenish strategy.
     * 
     * The internal bitmap is divided into regions. Only one small region is scanned
     * at a given time to save time instead of scanning the entire bitmap whenever
     * the address cache is exhausted and an address is needed.
     * 
     * @throws L1_ALLOC_ADDRESS_EXHAUSTION
     */
    private fastReplenish(retry = 0): void {

        // Throw after full cycle of retries to signify address exhaustion
        if (retry === this.replRegions) throw new IBFSError('L1_AS_ADDRESS_EXHAUST')

        const region = this.replCycle.next().value
        const start = region * this.cache.length
        const end = Math.min(start + this.cache.length, this.size) - 1

        for (let i = start; i <= end; i++) {

            const address = i + this.offset
            if (this.isTaken(address)) continue

            // Mark address as allocated to effectively "move it out"
            // from the bitmap to the cache
            this.markAllocated(address)
            this.cacheHealth++
            this.cache[this.cacheHealth] = address

        }

        // Retry a fast replenish with another region if the cache is still empty
        if (this.cacheHealth === -1) this.fastReplenish(retry+1)

    }

    /**
     * Does a full scan of the underlying address bitmap to replenish the cache.
     *
     * @unused The method is not currently used, but may be in the future.
     * @throws L1_ALLOC_ADDRESS_EXHAUSTION
     */
    private fullReplenish() {

        const start = this.offset
        const end = this.size -1

        for (let i = start; i <= end; i++) {
            
            const address = i
            if (this.isTaken(address)) continue

            // Marks address as allocated to effectively "moves it out"
            // from the bitmap to the cache
            this.markAllocated(address)
            this.cacheHealth++
            this.cache[this.cacheHealth] = address

            if (this.cacheHealth === this.cache.length - 1) break

        }

        // Throw after full cycle of retries to signify address exhaustion
        if (this.cacheHealth === -1) throw new IBFSError('L1_AS_ADDRESS_EXHAUST')

    }

    /**
     * Cycles through the bitmap in a sliding-window approach
     * for every time addresses are replenished into the stack array.
     */
    private static *createCycle(range: number): Generator<number> {
        let current = 0
        while (true) {
            yield current
            current = (current + 1) % range
        }
    }

    // Caching ---------------------------------------------------------------------------------------------------------
    // This section is used solely for loading and saving the address space bitmap to the disk
    // To peed up subsequent startups.

    public async loadBitmap(filePath: string): T.XEavSA<"L1_AS_BITMAP_LOAD"|"L1_AS_BITMAP_LOAD_NOTFOUND"> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L1_AS_BITMAP_LOAD', null, error as Error)
        }
    }

    public async saveBitmap(filePath: string): T.XEavSA<"L1_AS_BITMAP_SAVE"> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L1_AS_BITMAP_SAVE', null, error as Error)
        }
    }

}