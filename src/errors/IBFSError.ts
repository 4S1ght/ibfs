import type * as T from '@types'

enum ErrorCodes {
    
    // Level 0 errors
    L0_VCREATE_CANT_CREATE       = 101, // Can't create an IBFS volume
    L0_VCREATE_WS_ERROR          = 102, // Write stream error ocurred while the volume was being created
    L0_VCREATE_DRIVER_MISCONFIG  = 103, // Driver misconfiguration
    
    L0_CRYPTO_KEY_REQUIRED       = 104, // A key is required but was not provided
    L0_CRYPTO_KEY_CANT_DIGEST    = 105, // An error was thrown while digesting an AES key
    L0_CRCSUM_MISMATCH           = 106, // CRC error detection triggered when deserializing a data block
    
    L0_VOPEN_UNKNOWN             = 107, // Can't open the volume image and initialize the Volume class
    L0_VOPEN_ROOT_DESERIALIZE    = 108, // Failed to deserialize the root sector needed for further initialization
    L0_VOPEN_MODE_INCOMPATIBLE   = 109, // The volume is incompatible with the NodeJS crypto APIs
    L0_VOPEN_SIZE_MISMATCH       = 110, // Image file size differs from expected
 
    L0_BS_ROOT_SR                = 111, // Problem serializing a root sector
    L0_BS_ROOT_DS                = 112, // Problem deserializing a root sector
    L0_BS_HEAD_SR                = 113, // Problem serializing a head block
    L0_BS_HEAD_DS                = 114, // Problem deserializing a head block
    L0_BS_LINK_SR                = 115, // Problem serializing a link block
    L0_BS_LINK_DS                = 116, // Problem deserializing a link block
    L0_BS_STORE_SR               = 117, // Problem serializing a store block
    L0_BS_STORE_DS               = 118, // Problem deserializing a store block
    L0_BS_META_SR                = 119, // Problem serializing metadata block
    L0_BS_META_DS                = 120, // Problem deserializing metadata block

    L0_IO_RESOURCE_BUSY          = 121, // Attempted to access a resource that was 
    L0_IO_UNKNOWN                = 122, // Unknown I/O error
                                        // occupied by a different part of the program
    L0_IO_READ                   = 123, // Failed to read data
    L0_IO_READ_DS                = 125, // Data was read but could not be deserialized
    L0_IO_READ_META              = 124, // Failed to read meta block
    L0_IO_WRITE                  = 126, // Failed to write data
    L0_IO_WRITE_SR               = 126, // Could not serialize block data before write
    L0_IO_WRITE_META             = 127, // Failed to write meta block

}

export type IBFSErrorCode = keyof typeof ErrorCodes
export type IBFSErrorMetadata = { [key: string]: any }

export default class IBFSError<Code extends IBFSErrorCode = IBFSErrorCode> extends Error {

    public readonly errno: number
    public readonly code: Code
    public readonly rootCause?: IBFSError
    public readonly causes: Error[] = []
    public readonly meta: IBFSErrorMetadata = {}

    constructor(code: Code, message?: string|null, cause?: Error | null, meta?: IBFSErrorMetadata) {
        
        super(message || (cause instanceof Error ? IBFSError.messageCause(cause) : undefined))
        this.name = this.constructor.name
        this.code = code
        this.errno = ErrorCodes[code]
        meta && (this.meta = meta)
        cause instanceof IBFSError && (this.rootCause = (cause.causes[cause.causes.length-1] || cause) as IBFSError)
        
        Error.captureStackTrace(this, this.constructor)

        if (cause) {
            if (cause instanceof IBFSError) {
                this.causes = [cause, ...cause.causes]
                // @ts-ignore - Readonly only outside the error class.
                cause.causes = []
            }
            else {
                this.causes.unshift(cause)
            }
        }

    }

    private static messageCause(cause: Error | IBFSError) {
        return cause.message.startsWith('[Root cause')
            // @ts-ignore
            ? cause.code ? `[Root cause <${cause.code}>] ${cause.message}` : `[Root cause] ${cause.message}`
            : cause.message
    }

    /**
     * Constructs a new IBFSError instance in an Eav (error-as-value) format. 
     * @returns [IBFSError, null]
     */
    public static eav<Code extends IBFSErrorCode>(code: Code, ...params: T.OmitFirst<ConstructorParameters<typeof IBFSError>>): [IBFSError<Code>, null] {
        return [new this(code, ...params), null]
    }

}