// AdStack (Address Stack) is responsible for providing a caching
// Layer on top of the underlying address bitmap. It keeps a small
// cache of full-size JS number addresses for fast allocation and
// replenishes it as needed.

// Imports ========================================================================================

import { randomBytes } from "crypto"
import IBFSError from "../errors/IBFSError.js"
import AdMap, { TAdMapInit } from "./AdMap.js"

// Types ==========================================================================================

export interface TAdStackInit extends TAdMapInit {
    /** The number of addresses cached at a time. */ cacheSize: number
}

// Exports ========================================================================================

export default class AdStack extends AdMap {

    private readonly cache: Array<number | undefined>
    private cacheHealth = -1
    
    private replRegions: number
    private replCycle: Generator<number>

    constructor(init: TAdStackInit) {
        super(init)
        this.cache = new Array(init.cacheSize).fill(undefined)
        this.replRegions = Math.ceil(init.size / init.cacheSize)
        this.replCycle = AdStack.createCycle(this.replRegions)
    }

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
        if (retry === this.replRegions) throw new IBFSError('L1_ALLOC_ADDRESS_EXHAUSTION')

        const region = this.replCycle.next().value
        const start = region * this.cache.length
        const end = Math.min(start + this.cache.length, this.size) - 1

        for (let i = start; i <= end; i++) {

            const address = i + this.offset
            if (this.isTaken(address)) continue

            // Marks address as allocated to effectively "moves it out"
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
        if (this.cacheHealth === -1) throw new IBFSError('L1_ALLOC_ADDRESS_EXHAUSTION')

    }

    /**
     * Cycles through regions of the internal bitmap in order
     * to separate it for faster reads.
     */
    private static *createCycle(range: number): Generator<number> {
        let current = 0
        while (true) {
            yield current
            current = (current + 1) % range
        }
    }

}