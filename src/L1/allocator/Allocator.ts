// Imports ========================================================================================

import type * as T from '@types'

import fs                      from 'node:fs/promises'
import path                    from 'node:path'

import AddressStackChunk       from "@L1/allocator/AddressChunk.js"
import TimeWheel               from '@L1/allocator/TimeWheel.js'
import IBFSError               from '@errors'
import { ADDR_STACK_FILE_EXT } from '@constants'

// Types ==========================================================================================

export interface ASInit {
    /** The total number of user-space sector addresses. */
    poolSize: number
    /** Number of addresses held in each stack chunk. */
    chunkSize: number
    /** The number of addresses left in the current chunk which when reached trigger preloading of the next chunk. */
    chunkPreloadThreshold: number
    /** The number of addresses left from filling the current chunk that when reached triggers the unload of the previous chunk. */
    chunkUnloadThreshold: number
    /** Directory where stack chunks are offloaded to. */
    location: string
    /** Internal time wheel configuration. */
    timeWheel: {
        /** Number of buckets where events are sorted to. */
        bucketCount: number
        /** The duration of each tick inside the time wheel. */
        tickDuration: number
        /** The number of idle ticks before the time wheel enters idle state. */
        idleAfterTicks: number
    }
}

// Module =========================================================================================

/**
 * The address stack holds a stack of unallocated sector addresses and manages their allocation.  
 * An address is "lent" by a the program for set amount of time and committed on successful write, 
 * otherwise it's revoked and returned to the stack.
 */
export default class Allocator {

    private declare poolSize: number
    private declare chunkSize: number

    private declare preloadMark: number
    private declare unloadMark: number

    private declare location: string

    private declare tw: TimeWheel
    private chunks: AddressStackChunk[] = []
    private currentChunk = 0

    private constructor(init: ASInit) {}

    public static async instance(init: ASInit): T.XEavA<Allocator, 'L1_ALLOC_CANT_INITIALIZE'> {
        try {

            const self = new this(init)
            self.poolSize = init.poolSize
            self.chunkSize = init.chunkSize
            self.location = init.location

            self.preloadMark = init.chunkPreloadThreshold
            self.unloadMark = init.chunkUnloadThreshold

            // Prepare directory ------------------------------------

            // Make
            await fs.mkdir(self.location, { recursive: true })

            // Clear
            const chunksDir = (await fs.readdir(self.location)).filter(file => path.extname(file) === ADDR_STACK_FILE_EXT)
            for (let i = 0; i < chunksDir.length; i++) await fs.rm(path.join(self.location, chunksDir[i]!))
            
            // Prepare chunks ---------------------------------------

            const chunkCount = Math.ceil(self.poolSize / self.chunkSize)
            for (let i = 0; i < chunkCount; i++) {
                const name = path.join(self.location, i.toString(16).padStart(6, '0') + ADDR_STACK_FILE_EXT)
                const chunk = new AddressStackChunk(name, self.chunkSize)
                self.chunks.push(chunk)
            }

            // Time wheel -------------------------------------------

            self.tw = new TimeWheel(
                init.timeWheel.bucketCount,
                init.timeWheel.tickDuration,
                init.timeWheel.idleAfterTicks
            )

            return [null, self]
        
        } 
        catch (error) {
            return IBFSError.eav('L1_ALLOC_CANT_INITIALIZE', null, error as Error)
        }
    }

    /**
     * Lends the driver
     * @param batchSize Max size of a continuous batch/block of addresses.
     */
    public async alloc(blockSize: number, duration = 5000) {
        try {

            const chunk = this.chunks[this.currentChunk]!
            const addressBlock = Allocator.qcbs(chunk.addresses, blockSize)
            // Unfinished ...
            
        } 
        catch (error) {
            
        }
    }

    /**
     * Frees an address and returns it back to the stack.
     */
    public free(addresses: number[]) {

    }

    /**
     * Marks lent addresses as allocated, after which they will be removed from the stack
     * and no longer available for reallocation until they are freed.
     */
    public commit(addresses: number[]) {

    }

    // Loading & unloading chunks -----------------------------------

    /**
     * Checks the current address chunk and its neighbors for whether any should loaded
     * or unloaded. Loading & unloading is staggered to prevent situations where frequent
     * file writes & deletions oscillate on the border of two chunks causing great I/O drops
     * and latency due to frequent pulling of data between the disk and system memory.
     * @returns 
     */
    private async triggerChunkSwapCheck(): T.XEavSA<'L1_ALLOC_CANT_RELOAD'|'L1_ALLOC_CANT_UNLOAD_CHUNK'|'L1_ALLOC_CANT_LOAD_CHUNK'> {
        try {

            const prev    = this.chunks[this.currentChunk - 1]
            const current = this.chunks[this.currentChunk    ]!
            const next    = this.chunks[this.currentChunk + 1]

            // Load next chunk ------------------
            if (current.count < this.preloadMark && next && !next.loaded) {
                const error = await next.load()
                if (error) return error
            }
            // Unload next chunk ----------------
            if (current.count > this.unloadMark && next && next.loaded) {
                const error = await next.unload()
                if (error) return error
            }

            // Load previous chunk --------------
            if (current.count > this.chunkSize - this.preloadMark && prev && !prev.loaded) {
                const error = await prev.load()
                if (error) return error
                
            }
            // Unload previous chunk ------------
            if (current.count < this.chunkSize - this.unloadMark && prev && prev.loaded) {
                const error = await prev.unload()
                if (error) return error
            }

        } 
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_RELOAD')
        }
    }

    // Utils --------------------------------------------------------

    /**
     * Quick Consecutive Block Search - Returns the first address batch of requested size
     * or the largest overall if a sufficiently large one was not found.
     */
    public static qcbs(source: number[], maxSize = 256) {
        
        type Group = { index: number, items: number[] }

        let maxGroup:     Group = { index: 0, items: [] }
        let currentGroup: Group = { index: 0, items: [source[0]!] }

        for (let i = 1; i < source.length; i++) {
            if (source[i] === source[i - 1]! + 1) {
                currentGroup.items.push(source[i]!)
                if (currentGroup.items.length === maxSize) {
                    maxGroup = currentGroup
                    break
                }
            }
            else {
                if (currentGroup.items.length > maxGroup.items.length) {
                    maxGroup = currentGroup
                }
                currentGroup = { index: i, items: [source[i]!] }
            }            
        }

        return maxGroup

    }

    /**
     * Slow Consecutive Block Search - Returns an address batch closest to matching the requested size.
     * This operation scans the entire source array and may yield slowly, use `qcbs`
     * if write speeds are of the upmost importance (although at the cost of higher fragmentation)
     * @throws (not implemented)
     */
    public static scbs(source: number[], maxSize = 256) {
        throw new Error('Not implemented')
    }

}