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

    // Scheme: LEVEL_SCOPE_ERROR_CODE_...

    // Level 1 ----------------------------------------------------------------

    // Cryptography
    L0_AES_NOKEY                    : "AES key was not provided byt required by the encryption settings.",
    L0_AES_KEYDIGEST                : "Failed to digest the provided AES key.",

    // De/serialization
    L0_SR_ROOTERR                   : "An error occurred while serializing the root block.",
    L0_DS_ROOTERR                   : "An error occurred while deserializing the root block.",
    L0_SR_METAERR                   : "An error occurred while serializing the metadata cluster.",
    L0_DS_METAERR                   : "An error occurred while deserializing the metadata cluster.",
    L0_SR_HEADERR                   : "An error occurred while serializing a head block.",
    L0_DS_HEADERR                   : "An error occurred while deserializing a head block.",
    L0_SR_LINKERR                   : "An error occurred while serializing a link block.",
    L0_DS_LINKERR                   : "An error occurred while deserializing a link block",
    L0_SR_DATAERR                   : "An error occurred while serializing a data block.",
    L0_DS_DATAERR                   : "An error occurred while deserializing a data block.",

    // Volume creation/initialization
    L0_VI_FAILURE                   : "An error occurred while initializing the volume.",

    // Volume closing
    L0_VC_FAILURE                   : "An error occurred while closing the volume.",

    // Volume mounting      
    L0_VO_UNKNOWN                   : "An unknown error occurred while mounting the volume.",
    L0_VO_ROOTFAULT                 : "The root sector of the volume is corrupted.",
    L0_VO_MODE_INCOMPATIBLE         : "Can't mount the volume because it was created with a different encryption mode. NodeJS does not natively expose APIs for manipulating encryption tweak values and needs to emulate them. This volume was not set up for and can not be decrypted using this runtime.",
    L0_VO_SIZE_MISMATCH             : "The size of the volume image does not match the size expected according to volume metadata. This is likely a sign of image corruption.",

    // I/O      
    L0_IO_READ_ERROR                : "An error occurred while reading from the volume.",
    L0_IO_WRITE_ERROR               : "An error occurred while writing to the volume.",

    L0_IO_ROOT_WRITE_ERROR          : "An error occurred while writing a head block.",
    L0_IO_ROOT_SR_ERROR             : "An error occurred while serializing a head block.",

    L0_IO_META_READ_ERROR           : "An error occurred while reading a metadata cluster.",
    L0_IO_META_DS_ERROR             : "An error occurred while deserializing a metadata cluster.",
    L0_IO_META_WRITE_ERROR          : "An error occurred while writing a metadata cluster.",
    L0_IO_META_SR_ERROR             : "An error occurred while serializing a metadata cluster.",

    L0_IO_HEAD_READ_ERROR           : "An error occurred while reading a head block.",
    L0_IO_HEAD_READ_INTEGRITY_ERROR : "Detected an integrity mismatch while reading a head block - This probably indicates corruption.",
    L0_IO_HEAD_READ_UNKNOWN_ERROR   : "An unknown error occurred while reading a head block.",
    L0_IO_HEAD_DS_ERROR             : "An error occurred while deserializing a head block.",
    L0_IO_HEAD_WRITE_ERROR          : "An error occurred while writing a head block.",
    L0_IO_HEAD_WRITE_UNKNOWN_ERROR  : "An unknown error occurred while writing a head block.",
    L0_IO_HEAD_SR_ERROR             : "An error occurred while serializing a head block.",

    L0_IO_LINK_READ_ERROR           : "An error occurred while reading a link block.",
    L0_IO_LINK_READ_INTEGRITY_ERROR : "Detected an integrity mismatch while reading a link block - This probably indicates corruption.",
    L0_IO_LINK_READ_UNKNOWN_ERROR   : "An unknown error occurred while reading a link block.",
    L0_IO_LINK_DS_ERROR             : "An error occurred while deserializing a link block.",
    L0_IO_LINK_WRITE_ERROR          : "An error occurred while writing a link block.",
    L0_IO_LINK_WRITE_UNKNOWN_ERROR  : "An unknown error occurred while writing a link block.",
    L0_IO_LINK_SR_ERROR             : "An error occurred while serializing a link block.",

    L0_IO_DATA_READ_ERROR           : "An error occurred while reading a data block.",
    L0_IO_DATA_READ_INTEGRITY_ERROR : "Detected an integrity mismatch while reading a data block - This probably indicates corruption.",
    L0_IO_DATA_READ_UNKNOWN_ERROR   : "An unknown error occurred while reading a data block.",
    L0_IO_DATA_DS_ERROR             : "An error occurred while deserializing a data block.",
    L0_IO_DATA_WRITE_ERROR          : "An error occurred while writing a data block.",
    L0_IO_DATA_WRITE_UNKNOWN_ERROR  : "An unknown error occurred while writing a data block.",
    L0_IO_DATA_SR_ERROR             : "An error occurred while serializing a data block.",
    
    // Level 2 ----------------------------------------------------------------

    L1_DIR_INIT                     : "An error occurred while initializing directory buffers context.",
    L1_DIR_SR                       : "An error occurred while serializing a directory entry.",
    L1_DIR_DS                       : "An error occurred while deserializing a directory entry.",

    L1_FS_CREATE_ROOT               : "An error occurred while creating the filesystem root.",

}