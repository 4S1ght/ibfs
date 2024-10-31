// Imports ========================================================================================

import type * as T from '@types'

import AddressStackChunk from "@L1/AddressStack/AddressStackChunk.js"

// Module =========================================================================================

/**
 * The address stack holds a stack of unallocated sector addresses and manages their allocation.  
 * An address is "lent" by a the program for set amount of time and committed on successful write, 
 * otherwise it's revoked and returned to the stack.
 */
export default class AddressStack {

    private constructor() {}

    public static instance(): T.XEavA<AddressStack, 'L1_AS_CANT_INITIALIZE'> {
        try {
            
        } 
        catch (error) {
            
        }
    }

    /**
     * Lends the driver
     * @param maxBatchSize Max size of a continuous batch/block of addresses.
     */
    public lend(maxBatchSize: number) {

    }

    /**
     * Marks lent addresses as allocated, after which they will be removed from the stack
     * and no longer available for reallocation until they are freed.
     */
    public commit(addresses: number[]) {

    }

    public free(addresses: number[]) {

    }

}