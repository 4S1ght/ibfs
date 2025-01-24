// AdStack (Address Stack)
// This module temporarily stores an array of real addresses in a number format
// that can be easily accessed by the rest of the filesystem driver while the 
// Address Map stores the rest inside a bitmap to preserve space.

// Imports ========================================================================================

import IBFSError from "../errors/IBFSError.js"
import AdMap, { TAdMapInit } from "./AdMap.js"

// Types ==========================================================================================

export interface TAdStackInit extends TAdMapInit {
    /** The size of the address cache that holds fast-access addresses.        */ cacheSize: number
}

// Exports ========================================================================================

export default class AdStack extends AdMap {

    private cache: Array<number>
    private cacheHealth = 0
    private replRegions: number
    private replCycle: Generator<number>

    constructor(init: TAdStackInit) {
        super(init)
        this.cache = new Array(init.cacheSize).fill(undefined)
        this.replRegions = Math.ceil(init.addressCount / init.cacheSize)
        this.replCycle = AdStack.createCycle(this.replRegions)
    }

    /** Allocates an address */
    public alloc() {
        if (this.cacheHealth === -1) this.fastReplenish()
        const address = this.cache[this.cacheHealth]
        this.cacheHealth--
        return address
    }

    /** 
     * Does a basic, quick replenish on the cache.
     * A full replenish is handled independently in idle time.
     */
    private fastReplenish(retry = 0) {

        // Throw after full cycle of retries to signify address exhaustion
        if (retry === this.replRegions) throw new IBFSError('L1_ALLOC_ADDRESS_EXHAUSTION')

        const regionIndex = this.replCycle.next().value
        const regionStart = regionIndex * this.cache.length   
        const regionEnd = Math.min(regionStart + this.cache.length, this.size) - 1

        for (let i = regionStart; i <= regionEnd; i++) {
            const address = regionStart + i
            if (this.get(address)) continue
            this.cache[this.cacheHealth++] = address
        }

        // Retry a fast replenish with another region if the cache is still empty
        if (this.cacheHealth === -1) this.fastReplenish(retry++)
    }

    /**
     * Does a full replenish on the cache, scanning the entire
     * address bitmap if needed.
     */
    private replenish() {

    }

    /**
     * Cycles through chunks of the internal bitmap in order
     * to separate it into small regions for fast replenishing.
     */
    private static *createCycle(range: number): Generator<number> {
        let current = 0
        while (true) {
            yield current
            current = (current + 1) % (range + 1)
        }
    }

}