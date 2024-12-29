// Imports ========================================================================================

import type * as T from '../../../types.js'

import AES, { TAESConfig } from '../AES.js'
import IBFSError from '../../errors/IBFSError.js'

import RootBlock, { TRootBlock } from './RootBlock.js'
import MetaCluster from './MetaCluster.js'

// Types ==========================================================================================

export interface TSerializeConfig {
    blockSize: keyof typeof RootBlock.BLOCK_SIZES
}

// Exports ========================================================================================

export default class Serialize {

    public static readonly HEAD_HEADER = 64
    public static readonly LINK_HEADER = 32
    public static readonly STORE_HEADER = 32
    public static readonly META_HEADER = 16

    public readonly BLOCK_SIZE: number
    public readonly HEAD_BODY: number
    public readonly LINK_BODY: number
    public readonly STORAGE_BODY: number

    public readonly crypto: AES

    constructor(config: TSerializeConfig & TAESConfig) {

        this.BLOCK_SIZE     = RootBlock.BLOCK_SIZES[config.blockSize]
        this.HEAD_BODY      = this.BLOCK_SIZE - Serialize.HEAD_HEADER
        this.LINK_BODY      = this.BLOCK_SIZE - Serialize.LINK_HEADER
        this.STORAGE_BODY   = this.BLOCK_SIZE - Serialize.STORE_HEADER

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
            const block = RootBlock.create(data)
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
            const block = RootBlock.from(buffer)
            return [null, block]
        } 
        catch (error) {
            return [new IBFSError('L0_SR_DSFAIL_ROOT', null, error as Error), null]    
        }
    }


}