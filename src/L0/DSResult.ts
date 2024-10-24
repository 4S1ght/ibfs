// Imports ========================================================================================

import IBFSError, { IBFSErrorCode, IBFSErrorMetadata }  from "@errors"
import { CommonReadMeta, LinkBlock, StorageBlock }      from "@L0/Serialize.js"

// Types ==========================================================================================

export interface DSComplete<Meta extends LinkBlock | StorageBlock> {
    readonly meta:          Meta & CommonReadMeta
    readonly crc:           number
    readonly crcMismatch:   boolean
    readonly error:         null
}

export interface DSFailure<ErrorCode extends IBFSErrorCode> {
    readonly meta:          null
    readonly crc:           null
    readonly crcMismatch:   null
    readonly error:         IBFSError<ErrorCode>
}

/** 
 * Read results are of unknown type until checked against.  
 * A read operation can either result in a failure or a success.
 * A failure is indicated by an `error` property on the returned object.
 */
export type UnknownDSResult<Meta extends LinkBlock|StorageBlock, ErrorCode extends IBFSErrorCode> = 
    | DSComplete<Meta>
    | DSFailure<ErrorCode>

// Module =========================================================================================

/**
 * Represents deserialization results of either a link or storage block.
 */
export default class DSResult<Meta extends LinkBlock|StorageBlock, ErrorCode extends IBFSErrorCode> {

    /** Block metadata (includes deserialized block data) */
    public readonly meta: null | Meta & CommonReadMeta
    /** Deserialization error (if thrown) */
    public readonly error: null | IBFSError<ErrorCode>
    /** CRC value computed while deserializing block data. */
    public readonly crc: null | number
    /** Indicates whether a CRC mismatch ocurred. Generated by comparing live CRC with the one saved in block metadata. */
    public readonly crcMismatch: null | boolean

    private constructor(meta: Meta & CommonReadMeta | null, crc: number | null, error?: IBFSError<ErrorCode> | null) {
        this.meta        = meta
        this.error       = error || null
        this.crc         = crc
        this.crcMismatch = meta ? meta.crc32Sum !== crc : false
    }

    /**
     * **Note:** A complete deserialization result does not mean a success.  
     * Data may still be corrupted, so CRC must be checked for mismatch.
     */
    static complete<Meta extends LinkBlock | StorageBlock>(meta: Meta & CommonReadMeta, crc: number): DSComplete<Meta> {
        return new this(meta, crc, null) as DSComplete<Meta>
    }

    static failure<ErrorCode extends IBFSErrorCode>(code: IBFSErrorCode, message?: string|null, cause?: Error | null, meta?: IBFSErrorMetadata): DSFailure<ErrorCode> {
        const ibfsError = new IBFSError(code, message, cause, meta)
        return new this(null, null, ibfsError) as DSFailure<ErrorCode>
    }

}
