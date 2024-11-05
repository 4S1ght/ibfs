// Imports ========================================================================================

import type * as T from '@types'

import fs                      from 'node:fs/promises'
import path                    from 'node:path'

import AddressStackChunk       from "@L1/AddressStack/AddressStackChunk.js"
import TimeWheel               from '@L1/AddressStack/TimeWheel.js'
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
export default class AddressStack {

    private declare poolSize: number
    private declare chunkSize: number
    private declare chunkPreloadThreshold: number
    private declare chunkUnloadThreshold: number
    private declare location: string

    private declare tw: TimeWheel
    private chunks: AddressStackChunk[] = []
    private currentChunk = 0

    private constructor() {}

    public static async instance(init: ASInit): T.XEavA<AddressStack, 'L1_AS_CANT_INITIALIZE'> {
        try {

            const self = new this()
            self.poolSize = init.poolSize
            self.chunkSize = init.chunkSize
            self.chunkPreloadThreshold = init.chunkPreloadThreshold
            self.chunkUnloadThreshold = init.chunkUnloadThreshold
            self.location = init.location

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
            return IBFSError.eav('L1_AS_CANT_INITIALIZE', null, error as Error)
        }
    }

    /**
     * Lends the driver
     * @param batchSize Max size of a continuous batch/block of addresses.
     */
    public async alloc(addresses: number) {
        try {

            
            
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

}