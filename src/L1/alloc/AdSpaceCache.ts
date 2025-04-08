// Imports =============================================================================================================

import type * as T  from '../../../types.js'

import crypto       from 'node:crypto'
import fs           from 'node:fs/promises'

import Memory       from '../../L0/Memory.js'
import UUID         from '../../misc/uuid.js'

// Types ===============================================================================================================

export type TASCCipher = 'none' | 'aes-128-cbc' | 'aes-256-cbc'

// Exports =============================================================================================================

export default class AdSpaceCache {
    
    /** 
     * Loads a cached address space bitmap from the disk.
     * 
        Index  | Size | Type   | Description
        -------|------|--------|-------------------------------------------------------
        0      | 16B  | Buffer | AES IV
        16     | 16B  | UUID   | UUID of the associated volume
        32     | 8B   | Number | Length of the address space bitmap (after decryption)
        40-128 | ---- | ------ | --------------------- Reserved -----------------------
        129-N  | N    | Body   | Address space bitmap
    
     */
    public static async loadFrom(file: string, cipher: string, aesKey: string) {
        try {

            const mem = Memory.wrap(await fs.readFile(file))

            const iv    = mem.read(16)
            const uuid  = UUID.toString(mem.read(16))
            const size  = mem.readInt64()

            mem.bytesRead = 128

            const data = mem.readRemaining()

        } 
        catch (error) {
            
        }
    }

    public static async saveTo(file: string, cipher: string,aesKey: string) {
        try {
            
        } 
        catch (error) {
            
        }
    }


}
