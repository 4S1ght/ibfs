// Imports ========================================================================================

import type * as T from '../../../types'

import Memory from '../Memory'
import AES, { TAESConfig } from '../AES'
import IBFSError from '../../errors/IBFSError'

import RootBlock, { TRootBlock } from './RootBlock'

// Types ==========================================================================================

export interface TSerializeConfig {
    blockSize: keyof typeof RootBlock.BLOCK_SIZES
}

// Exports ========================================================================================

export default class Serialize {

    public static readonly HEAD_META = 64
    public static readonly LINK_META = 32
    public static readonly STORAGE_META = 32
    public static readonly VDATA_META = 16

    public readonly BLOCK_SIZE: number
    public readonly HEAD_BODY: number
    public readonly LINK_BODY: number
    public readonly STORAGE_BODY: number
    public readonly ARB_SIZE: number

    public readonly crypto: AES

    constructor(config: TSerializeConfig & TAESConfig) {

        this.BLOCK_SIZE     = RootBlock.BLOCK_SIZES[config.blockSize]
        this.HEAD_BODY      = this.BLOCK_SIZE - Serialize.HEAD_META
        this.LINK_BODY      = this.BLOCK_SIZE - Serialize.LINK_META
        this.STORAGE_BODY   = this.BLOCK_SIZE - Serialize.STORAGE_META
        this.ARB_SIZE       = Math.ceil(1024*64 / this.BLOCK_SIZE) * this.BLOCK_SIZE

        this.crypto = new AES({
            iv: config.iv,
            cipher: config.cipher
        })

    }

    // Root block =================================================================================

    /** 
     * Creates a new root block and populates it with `data`
     */
    public static serializeRootBlock(data: TRootBlock): T.XEav<Buffer, "L0_SR_SRFAIL_ROOT"> {
        try {
            const block = RootBlock.fromObject(data)
            return [null, block.buffer]
        } 
        catch (error) {
            return [new IBFSError('L0_SR_SRFAIL_ROOT', null, error as Error, data), null]    
        }
    }

    /** 
     * Wraps an existing buffer and allows for reading it's properties through the RootBlock interface.
     */
    public static deserializeRootBlock(buffer: Buffer): T.XEav<RootBlock, "L0_SR_DSFAIL_ROOT"> {
        try {
            const block = RootBlock.fromBuffer(buffer)
            return [null, block]
        } 
        catch (error) {
            return [new IBFSError('L0_SR_DSFAIL_ROOT', null, error as Error), null]    
        }
    }


}