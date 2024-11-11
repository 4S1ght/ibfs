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
    // timeWheel: {
    //     /** Number of buckets where events are sorted to. */
    //     bucketCount: number
    //     /** The duration of each tick inside the time wheel. */
    //     tickDuration: number
    //     /** The number of idle ticks before the time wheel enters idle state. */
    //     idleAfterTicks: number
    // }
}

interface AllocAction {
    /** 
     * Sector addresses temporarily available to this part of the program
     * until they're timed out and returned to the stack.
     */
    addresses: number[]
    /**
     * Commit ID which needs to be provided to `Allocator.commit()` in order to
     * mark the requested addresses as allocated permanently.
     */
    commitID: string
    /**
     * Tells if the allocation has been timed out. `true` means the requested
     * addresses have been returned to the stack and are available for writes.
     * This means they will most likely soon be overwritten!
     */
    expired: boolean
}

// Module =========================================================================================

/**
 * Manages allocation and freeing of disk space.
 */
export default class Allocator {

    private declare poolSize: number
    private declare chunkSize: number

    private declare preloadNextMark: number
    private declare unloadNextMark: number
    private declare preloadPrivMark: number
    private declare unloadPrivMark: number

    private declare location: string

    // private declare tw: TimeWheel
    private chunks: AddressStackChunk[] = []
    private currentChunk = 0

    private constructor() {}

    public static async instance(init: ASInit): T.XEavA<Allocator, 'L1_ALLOC_CANT_INITIALIZE'|'L1_ALLOC_THRESHOLD_MISCONFIG'> {
        try {

            const self = new this()
            self.poolSize    = init.poolSize
            self.chunkSize   = init.chunkSize
            self.location    = init.location

            self.preloadNextMark = init.chunkPreloadThreshold
            self.unloadNextMark  = init.chunkUnloadThreshold
            self.preloadPrivMark = init.chunkSize - init.chunkPreloadThreshold
            self.unloadPrivMark  = init.chunkSize - init.chunkUnloadThreshold

            if (init.chunkUnloadThreshold < init.chunkPreloadThreshold) 
                return IBFSError.eav(
                    'L1_ALLOC_THRESHOLD_MISCONFIG', 
                    'Chunk unload threshold must be higher than preload threshold to prevent unnecessary I/O slowdowns.'
                )
        
            if (init.chunkSize < 3 * init.chunkUnloadThreshold) 
                return IBFSError.eav(
                    'L1_ALLOC_THRESHOLD_MISCONFIG', 
                    'Chunk size must be at least 3 times the unload threshold to prevent cases of constant I/O drops.'
                )

            // Prepare directory ------------------------------------

            // Make
            await fs.mkdir(self.location, { recursive: true })

            // Clear
            const chunksDir = (await fs.readdir(self.location)).filter(file => path.extname(file) === ADDR_STACK_FILE_EXT)
            for (let i = 0; i < chunksDir.length; i++) await fs.rm(path.join(self.location, chunksDir[i]!))
            
            // Prepare chunks ---------------------------------------

            const chunkCount = Math.ceil(self.poolSize / self.chunkSize)
            for (let i = 0; i < chunkCount; i++) {
                const name = path.join(self.location, i.toString().padStart(8, '0') + ADDR_STACK_FILE_EXT)
                const [chunkError, chunk] = await AddressStackChunk.instance(name, self.chunkSize)
                if (chunkError) return IBFSError.eav('L1_ALLOC_CANT_INITIALIZE', null, chunkError)
                self.chunks.push(chunk)
            }

            const loadError = await self.chunks[0]!.load()
            if (loadError) return IBFSError.eav('L1_ALLOC_CANT_INITIALIZE', null, loadError)

            // Time wheel -------------------------------------------

            // self.tw = new TimeWheel(
            //     init.timeWheel.bucketCount,
            //     init.timeWheel.tickDuration,
            //     init.timeWheel.idleAfterTicks
            // )

            return [null, self]
        
        } 
        catch (error) {
            return IBFSError.eav('L1_ALLOC_CANT_INITIALIZE', null, error as Error)
        }
    }

    /**
     * Allocates a block of addresses of size `blockSize`. if the current chunk does not hold
     * a consecutive block of addresses of requested size, the closest one in size is returned.
     * @param batchSize Max size of a continuous batch/block of addresses.
     */
    public async alloc(blockSize: number, /*duration = 5000*/): T.XEavA<number[] /*AllocAction*/, 'L1_ALLOC_CANT_ALLOC'|'L1_ALLOC_NONE_AVAILABLE'> {
        try {

            const swapError = await this.triggerChunkSwapCheck()
            if (swapError) return IBFSError.eav('L1_ALLOC_CANT_ALLOC', null, swapError)

            const chunk = this.chunks[this.currentChunk]!
            const addressBlock = Allocator.qcbs(chunk.addresses, blockSize)
            if (addressBlock.items.length === 0) return IBFSError.eav('L1_ALLOC_NONE_AVAILABLE')
        
            const addresses = chunk.addresses.splice(addressBlock.index, addressBlock.items.length)

            // const commitID = this.tw.add(duration, async () => {
            //     try { action.expired = true; await this.free(addressBlock.items) } 
            //     catch (error) { console.error(`Internal IBFS address stack deallocation error: (${commitID})`, error) }
            // })

            // const action: AllocAction = {
            //     addresses,
            //     commitID,
            //     expired: false
            // }
    
            return [null, addresses]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_ALLOC_CANT_ALLOC', null, error as Error)
        }
    }

    /**
     * Frees all provided addresses and returns them back to the stack.
     */
    public async free(addresses: number[]): T.XEavSA<'L1_ALLOC_CANT_FREE'>{
        try {
            const swapError = await this.triggerChunkSwapCheck()
            if (swapError) return new IBFSError('L1_ALLOC_CANT_FREE', null, swapError)

            const chunk = this.chunks[this.currentChunk]!
            const freeSpace = this.chunkSize - chunk.count
            
            if (freeSpace >= addresses.length) {
                chunk.addresses.push(...addresses)
            }
            else {
                const addressesToFree = addresses.splice(-freeSpace, freeSpace)
                chunk.addresses.push(...addressesToFree)
                const freeError = await this.free(addresses)
                if (freeError) return new IBFSError('L1_ALLOC_CANT_FREE', null, freeError, { overflow: true })
            }
            
        } 
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_FREE', null, error as Error, { addresses })
        }
    }

    /**
     * Similar in purpose to `Allocator.free` but used only during initialization
     * in order to fill out individual address chunks.
     */
    public async load(addresses: number[]): T.XEavSA<'L1_ALLOC_CANT_PREP'|'L1_ALLOC_OUT_OF_RANGE'> {
        try {
            
            const chunk = this.chunks[this.currentChunk]!
            const nextChunk = this.chunks[this.currentChunk+1]
            const freeSpace = chunk.size - chunk.count

            if (freeSpace >= addresses.length) {
                chunk.addresses.push(...addresses)
            }
            else if (nextChunk) {
                const addressesToLoad = addresses.splice(-freeSpace, freeSpace)
                chunk.addresses.push(...addressesToLoad)

                const unloadError = await chunk.unload()
                if (unloadError) return new IBFSError('L1_ALLOC_CANT_PREP', null, unloadError as Error)

                this.currentChunk++
                const chunkError = await chunk.load()
                if (chunkError) return new IBFSError('L1_ALLOC_CANT_PREP', null, chunkError as Error)

                const loadError = await this.load(addresses)
                if (loadError) return new IBFSError('L1_ALLOC_CANT_PREP', null, loadError as Error)
            }
            else {
                return new IBFSError('L1_ALLOC_OUT_OF_RANGE', null, null, { addresses })
            }

            if (chunk.count === chunk.size) {
                const unloadError = await chunk.unload()
                if (unloadError) return new IBFSError('L1_ALLOC_CANT_PREP', null, unloadError as Error)
            }
            
        } 
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_PREP', null, error as Error)
        }
    }


    /**
     * !!! Put on hold.
     * Marks lent addresses as allocated, after which they will be removed from the stack
     * and no longer available for reallocation until they are freed.
     */
    // public async commit(actionID: string) {x

    // }

    // Loading & unloading chunks -----------------------------------

    /**
     * Checks the current address chunk and its neighbors for whether any should be loaded
     * or unloaded. Loading & unloading is staggered to prevent situations where frequent
     * file writes & deletions oscillate on the border of two chunks causing great I/O drops and 
     * latency due to frequent pulling of data between the disk and system memory.
     * @returns 
     */
    private async triggerChunkSwapCheck(): T.XEavSA<'L1_ALLOC_CANT_RELOAD'|'L1_ALLOC_CANT_UNLOAD_CHUNK'|'L1_ALLOC_CANT_LOAD_CHUNK'> {
        try {

            const prev    = this.chunks[this.currentChunk - 1]
            const current = this.chunks[this.currentChunk    ]!
            const next    = this.chunks[this.currentChunk + 1]

            // Load next chunk ------------------
            if (current.count < this.preloadNextMark && next && !next.loaded) {
                const error = await next.load()
                if (error) return error
            }
            // Unload next chunk ----------------
            if (current.count > this.unloadNextMark && next && next.loaded) {
                const error = await next.unload()
                if (error) return error
            }

            // Load previous chunk --------------
            if (current.count > this.preloadPrivMark && prev && !prev.loaded) {
                const error = await prev.load()
                if (error) return error
                
            }
            // Unload previous chunk ------------
            if (current.count < this.unloadPrivMark && prev && prev.loaded) {
                const error = await prev.unload()
                if (error) return error
            }

            const chunk = this.chunks[this.currentChunk]!
            if (chunk.count === 0 && this.currentChunk < this.chunks.length-1) this.currentChunk++
            else if (chunk.count === this.chunkSize && this.currentChunk > 0) this.currentChunk--

        } 
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_RELOAD', null, error as Error)
        }
    }

    // Utils --------------------------------------------------------

    /**
     * Quick Consecutive Block Search - Returns the first address batch of requested size
     * or the largest overall if a sufficiently large one was not found. This method is better
     * suite for streams where quick allocation is desired.
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
     * This operation scans the entire source array and may yield slowly, use `qcbs` if write speeds are 
     * of the upmost importance (although at the cost of higher fragmentation).
     * This method is best suited for writing fixed-sized files where prologued I/O drops are not a concern.
     * @throws (not implemented)
     */
    public static scbs(source: number[], maxSize = 256) {
        throw new Error('Not implemented')
    }

}