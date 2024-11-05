// Imports ========================================================================================

import fs   from 'node:fs/promises'
import path from 'node:path'

import type * as T from '@types'
import IBFSError   from '@errors'
import Memory      from '@L0/Memory.js'

// Module =========================================================================================

export default class AddressStackChunk {

    public loaded: boolean = true
    public addresses: number[] = []
    public size: number

    public location: string
    public name: string
    
    constructor(location: string, size: number) {
        this.size = size
        this.location = location
        this.name = path.basename(location)
    }

    public sort() {
        this.loaded && this.addresses.sort()
    }

    public async load(): T.XEavSA<'L1_AS_CANT_LOAD_CHUNK'> {
        try {
            const fileData = Memory.intake(await fs.readFile(this.location))
            this.addresses = new Array(this.size).map(() => fileData.readInt64())
        } 
        catch (error) {
            return new IBFSError('L1_AS_CANT_LOAD_CHUNK', null, error as Error, this)
        }
    }

    public async unload(): T.XEavSA<'L1_AS_CANT_UNLOAD_CHUNK'> {
        try {
            const fileData = BigInt64Array.from(this.addresses.map(n => BigInt(n))) 
            await fs.writeFile(this.location, fileData)   
        }
        catch (error) {
            return new IBFSError('L1_AS_CANT_UNLOAD_CHUNK', null, error as Error, this)
        }
    }

}