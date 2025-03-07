import type * as T from '../../types.js'

export default class IBFSError<Code extends IBFSErrorCode = IBFSErrorCode> extends Error {

    public readonly code: Code
    public readonly causes: Error[] = []
    public readonly meta: IBFSErrorMetadata = {}
    public readonly rootCause?: IBFSError

    constructor(code: Code, message?: string | null, cause?: Error | null, meta?: IBFSErrorMetadata) {
        
        super(message || errorCodes[code])
        this.name = this.constructor.name
        this.code = code
        meta && (this.meta = meta)
        cause instanceof IBFSError && (this.rootCause = (cause.causes[cause.causes.length-1] || cause) as IBFSError)
        
        Error.captureStackTrace(this, this.constructor)

        if (cause) {
            if (cause instanceof IBFSError) {
                this.causes = [cause, ...cause.causes]
                // @ts-ignore - Readonly only outside the error class.
                cause.causes = []
                // @ts-ignore
                delete cause.rootCause
            }
            else {
                this.causes.unshift(cause)
            }
        } 

    } 

    /**
     * Constructs a new IBFSError instance in an Eav (error-as-value) format. 
     * @returns [IBFSError, null]
     */
    public static eav<Code extends IBFSErrorCode>(code: Code, ...params: T.OmitFirst<ConstructorParameters<typeof IBFSError>>): [IBFSError<Code>, null] {
        return [new this(code, ...params), null]
    }

}

export type IBFSErrorCode = keyof typeof errorCodes
export type IBFSErrorMetadata = { [key: string]: any }

const errorCodes = {

    // Scheme: LEVEL_SCOPE_ERRORCODE_...

    // Level 0 =========================================================================================================

    // Cryptography
    L0_AES_NOKEY:                   'AES encryption key was not provided.',
    L0_AES_KEYDIGEST:               'Unable to SHA-digest the AES encryption key.',

    // Block serialization ---------------------------------------------------------------------------------------------

    // Root block 
    L0_SR_ROOT:                     'Unable to serialize the root block.',
    L0_DS_ROOT:                     'Unable to deserialize the root block.',

    // Volume metadata
    L0_SR_META:                     'Unable to serialize the metadata cluster.',
    L0_DS_META:                     'Unable to deserialize the metadata cluster.',

    // Head blocks
    L0_SR_HEAD:                     'Unable to serialize a head block.',
    L0_SR_HEAD_SEGFAULT:            'Provided body data is too large to fit within a head block.',
    L0_SR_HEAD_ADDR_REMAINDER:      'Provided link block body length is not a multiple of 8 (required for BigInt addresses).',
    L0_DS_HEAD:                     'Unable to deserialize a head block.',
    L0_DS_HEAD_CORRUPT:             'The head block is corrupted, `addressCount` meta-tag does not reflect a proper block address count.',

    // Link blocks
    L0_SR_LINK:                     'Unable to serialize a link block.',
    L0_SR_LINK_SEGFAULT:            'Provided body data is too large to fit within a link block.',
    L0_SR_LINK_ADDR_REMAINDER:      'Provided link block body length is not a multiple of 8 (required for BigInt addresses).',
    L0_DS_LINK:                     'Unable to deserialize a link block.',
    L0_DS_LINK_CORRUPT:             'The link block is corrupted, `addressCount` meta-tag does not reflect a proper block address count.',

    // Data blocks
    L0_SR_DATA:                     'Unable to serialize a data block.',
    L0_SR_DATA_SEGFAULT:            'Provided body data is too large to fit within a data block.',
    L0_DS_DATA:                     'Unable to deserialize a data block.',

    // Volume initialization & opening ---------------------------------------------------------------------------------

    L0_VI_FAIL:                     'Unable to initialize a new volume.',

    L0_VO_CANT_OPEN:                'Unable to open the volume.',
    L0_VO_ROOTFAULT:                'The root block required for volume initialization is corrupted.',
    L0_VO_MODE_INCOMPATIBLE:        `The volume can't be opened because it was originally created using a different encryption mode that does not use tweak emulation and is incompatible with NodeJS crypto implementations.`,
    L0_VO_SIZE_MISMATCH:            'The physical size of the volume does not match the one configured in its metadata.',

    // Volume lifecycle ------------------------------------------------------------------------------------------------

    L0_VC_FAIL:                     'Unable to close the volume gracefully.',
    L0_VC_QUEUE_BUSY:               'The volume can not be closed because it is still performing I/O operations.',

    // Queuing ---------------------------------------------------------------------------------------------------------

    L0_IO_TIMED_OUT:                'I/O operation timed out. It was registered and probably has been/will be performed, but did not fit within the maximum time window.',

    // Volume I/O Errors -----------------------------------------------------------------------------------------------
    
    // Random IO
    L0_IO_READ:                     'Unable to read data from the volume.',
    L0_IO_WRITE:                    'Unable to write data to the volume.',

    // Block IO
    L0_IO_BLOCK_READ:               'Unable to read a block from the volume.',
    L0_IO_BLOCK_WRITE:              'Unable to write a block to the volume.',

    // Root block IO
    L0_IO_ROOT_OVERWRITE:           'Unable to overwrite the root block.',

    // Metadata
    L0_IO_META_READ:                'Unable to read the metadata cluster.',
    L0_IO_META_WRITE:               'Unable to write the metadata cluster.',

    // Head block
    L0_IO_HEADBLOCK_READ:           'Unable to read a head block.',
    L0_IO_HEADBLOCK_READ_INTEGRITY: 'The head block failed integrity checks.',
    L0_IO_HEADBLOCK_WRITE:          'Unable to write a head block.',

    // Link block
    L0_IO_LINKBLOCK_READ:           'Unable to read a link block.',
    L0_IO_LINKBLOCK_READ_INTEGRITY: 'The link block failed integrity checks.',
    L0_IO_LINKBLOCK_WRITE:          'Unable to write a link block.',

    // Data block
    L0_IO_DATABLOCK_READ:           'Unable to read a data block.',
    L0_IO_DATABLOCK_READ_INTEGRITY: 'The data block failed integrity checks.',
    L0_IO_DATABLOCK_WRITE:          'Unable to write a data block.',


}