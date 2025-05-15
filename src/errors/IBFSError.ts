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
    L0_AES_KEYDIGEST:               'Failed to SHA-digest the AES encryption key.',

    // Block serialization ---------------------------------------------------------------------------------------------

    // Root block 
    L0_SR_ROOT:                     'Failed to serialize the root block.',
    L0_DS_ROOT:                     'Failed to deserialize the root block.',

    // Volume metadata
    L0_SR_META:                     'Failed to serialize the metadata cluster.',
    L0_DS_META:                     'Failed to deserialize the metadata cluster.',

    // Head blocks
    L0_SR_HEAD:                     'Failed to serialize a head block.',
    L0_SR_HEAD_SEGFAULT:            'Provided body data is too large to fit within a head block.',
    L0_SR_HEAD_ADDR_REMAINDER:      'Provided link block body length is not a multiple of 8 (required for BigInt addresses).',
    L0_DS_HEAD:                     'Failed to deserialize a head block.',
    L0_DS_HEAD_CORRUPT:             'The head block is corrupted, `addressCount` meta-tag does not reflect a proper block address count.',

    // Link blocks
    L0_SR_LINK:                     'Failed to serialize a link block.',
    L0_SR_LINK_SEGFAULT:            'Provided body data is too large to fit within a link block.',
    L0_SR_LINK_ADDR_REMAINDER:      'Provided link block body length is not a multiple of 8 (required for BigInt addresses).',
    L0_DS_LINK:                     'Failed to deserialize a link block.',
    L0_DS_LINK_CORRUPT:             'The link block is corrupted, `addressCount` meta-tag does not reflect a proper block address count.',

    // Data blocks
    L0_SR_DATA:                     'Failed to serialize a data block.',
    L0_SR_DATA_SEGFAULT:            'Provided body data is too large to fit within a data block.',
    L0_DS_DATA:                     'Failed to deserialize a data block.',

    // Volume initialization & opening ---------------------------------------------------------------------------------

    L0_VI_FAIL:                     'Failed to initialize a new volume.',

    L0_VO_CANT_OPEN:                'Failed to open the volume.',
    L0_VO_ROOTFAULT:                'The root block required for volume initialization is corrupted.',
    L0_VO_MODE_INCOMPATIBLE:        `The volume can't be opened because it was originally created using a different encryption mode that does not use tweak emulation and is incompatible with NodeJS crypto implementations.`,
    L0_VO_SIZE_MISMATCH:            'The physical size of the volume does not match the one configured in its metadata.',

    // Volume lifecycle ------------------------------------------------------------------------------------------------

    L0_VC_FAIL:                     'Failed to close the volume gracefully.',
    L0_VC_QUEUE_BUSY:               'The volume can not be closed because it is still performing I/O operations.',

    // Queuing ---------------------------------------------------------------------------------------------------------

    L0_IO_TIMED_OUT:                'I/O operation timed out. It was registered and probably has been/will be performed, but did not fit within the maximum time window.',

    // Volume I/O Errors -----------------------------------------------------------------------------------------------
    
    // Random IO
    L0_IO_READ:                     'Failed to read data from the volume.',
    L0_IO_WRITE:                    'Failed to write data to the volume.',

    // Block IO
    L0_IO_BLOCK_READ:               'Failed to read a block from the volume.',
    L0_IO_BLOCK_WRITE:              'Failed to write a block to the volume.',

    // Root block IO
    L0_IO_ROOT_OVERWRITE:           'Failed to overwrite the root block.',

    // Metadata
    L0_IO_META_READ:                'Failed to read the metadata cluster.',
    L0_IO_META_WRITE:               'Failed to write the metadata cluster.',

    // Head block
    L0_IO_HEADBLOCK_READ:           'Failed to read a head block.',
    L0_IO_HEADBLOCK_READ_INTEGRITY: 'The head block failed integrity checks.',
    L0_IO_HEADBLOCK_WRITE:          'Failed to write a head block.',

    // Link block
    L0_IO_LINKBLOCK_READ:           'Failed to read a link block.',
    L0_IO_LINKBLOCK_READ_INTEGRITY: 'The link block failed integrity checks.',
    L0_IO_LINKBLOCK_WRITE:          'Failed to write a link block.',

    // Data block
    L0_IO_DATABLOCK_READ:           'Failed to read a data block.',
    L0_IO_DATABLOCK_READ_INTEGRITY: 'The data block failed integrity checks.',
    L0_IO_DATABLOCK_WRITE:          'Failed to write a data block.',

    // Level 1 =========================================================================================================

    // Address space
    L1_AM_ADDRESS_OUT_OF_RANGE:     'The provided address is out of range allowed by the current address space',
    L1_AS_ADDRESS_EXHAUST:          'The address space has been exhausted and no further space allocation is possible.',
    L1_AS_BITMAP_LOAD:              'Failed to load the address space bitmap from the host filesystem.',
    L1_AS_BITMAP_LOAD_NOTFOUND:     'The address space bitmap could not be found in the host filesystem.',
    L1_AS_BITMAP_SAVE:              'Failed to save the address space bitmap to the host filesystem.',
    L1_FS_ADSPACE_SCAN:             'Could not dynamically compose the address space map - Failed to scan the volume.',

    // File block maps
    L1_FBM_OPEN:                    'Failed to open the file block map.',
    L1_FBM_OPEN_CIRC:               'The file block map contains a circular address pointer and can not be opened.',
    L1_FBM_APPEND:                  'Failed to append a new address to the file block map.',
    L1_FBM_TRUNC:                   'Failed to truncate the file block map.',
    L1_FBM_TRUNC_OUTRANGE:          'The provided truncation count is out of range.',
    L1_FBM_GROW:                    'Failed to grow the FBM, possibly due to a failed link block write',
    L1_FBM_SHRINK:                  'Failed to shrink the FBM.',
    L1_FBM_SETMETA:                 'Failed to update the FBM metadata.',
    L1_FBM_GET_FILE_LENGTH:         'Failed to calculate the total length of the file.',

    // File handles
    L1_FH_OPEN:                     'Failed to open a file descriptor.',
    L1_FH_READ:                     'Failed to read contents of a of this descriptor',
    L1_FH_READ_STREAM:              'Failed to create a read stream for a file descriptor.',
    L1_FH_READ_STREAM_BUFFER:       'An error occurred while buffering the read stream.',
    L1_FH_WRITE_STREAM:             'Failed to create a write stream for a file descriptor.',
    L1_FH_WRITE_STREAM_FIRST:       'An error occurred while loading the first affected write stream block.',
    L1_FH_WRITE_STREAM_OUTRANGE:    'The provided write offset is larger than the length of the file.',
    L1_FH_WRITE_STREAM_FINAL:       'An error occurred while finalizing the write stream.',
    L1_FH_WRITE_FILE:               'Failed to write to the file.',
    L1_FH_TRUNC:                    'Failed to truncate the file.',
    L1_FH_TRUNC_OUTRANGE:           'The provided truncation length is out of range.',

    // Directory serialization
    L1_DIR_INIT:                    'Failed to initialize the directory serialization context.',
    
    L1_DIR_SR:                      'Failed to serialize a directory.',
    L1_DIR_DS:                      'Failed to deserialize a directory.',

    // Filesystem
    L1_FS_CREATE:                   'Failed to create the filesystem.',
    L1_FS_OPEN:                     'Failed to open the filesystem.',

    // Filesystem I/O
    L1_FS_OPEN_FBM:                 'Failed to open the file block map.',
    L1_FS_OPEN_FILE:                'Failed to open a file.',
    L1_FS_ADSPACE_LOAD:             'Failed to load the address space.',

}