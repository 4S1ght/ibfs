// Imports ========================================================================================

import fs   from 'node:fs/promises'
import path from 'node:path'

import type * as T from '@types'
import IBFSError   from '@errors'
import Memory      from '@L0/Memory.js'

// Module =========================================================================================

export default class AddressChunk {

    public loaded: boolean = true
    public addresses: number[] = []

    public declare size: number
    public declare location: string
    public declare name: string
    
    constructor() {
    }

    public static async instance(location: string, size: number): T.XEavA<AddressChunk, 'L1_ALLOC_CANT_INITIALIZE_CHUNK'> {
        try {
            const self = new this()
            self.size = size
            self.location = location
            self.name = path.basename(location)
            await self.unload()
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L1_ALLOC_CANT_INITIALIZE_CHUNK')
        }
    }

    public sort() {
        this.loaded && this.addresses.sort()
    }

    public get count() {
        return this.addresses.length
    }

    public async load(): T.XEavSA<'L1_ALLOC_CANT_LOAD_CHUNK'> {
        try {
            if (this.loaded) return
            const fileData = Memory.intake(await fs.readFile(this.location))
            const length = Math.floor(fileData.length / 8)
            for (let i = 0; i < length; i++) this.addresses.push(fileData.readInt64())
            this.loaded = true
        } 
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_LOAD_CHUNK', null, error as Error, this)
        }
    }

    public async unload(): T.XEavSA<'L1_ALLOC_CANT_UNLOAD_CHUNK'> {
        try {
            if (!this.loaded) return
            const fileData = BigInt64Array.from(this.addresses.map(n => BigInt(n))) 
            await fs.writeFile(this.location, fileData)   
            this.addresses = []
            this.loaded = false
        }
        catch (error) {
            return new IBFSError('L1_ALLOC_CANT_UNLOAD_CHUNK', null, error as Error, this)
        }
    }

}