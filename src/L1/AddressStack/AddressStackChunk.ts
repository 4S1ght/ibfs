// Imports ========================================================================================

import fs   from 'node:fs/promises'
import path from 'node:path'
import url  from 'node:url'

import { ADDR_STACK_FILE_EXT } from '@constants'
import type * as T from '@types'
import IBFSError from '@errors'

// Module =========================================================================================

export default class AddressStackChunk {

    public loaded: boolean = true
    public addresses: number[] = []
    public location: string
    public size: number
    
    constructor(location: string, size: number) {
        this.location = location
        this.size = size
    }

    public sort() {
        this.loaded && this.addresses.sort()
    }

    public async load(): T.XEavSA<'L1_AS_CANT_LOAD_CHUNK'> {
        try {
            const fileData = await fs.readFile(this.location)
            this.addresses = new Array(this.size)
                .map((_, i) => Number(fileData.readBigInt64LE(i*8)))
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