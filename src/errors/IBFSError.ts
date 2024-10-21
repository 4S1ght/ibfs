import type * as T from '@types'

enum ErrorCodes {
    
    // Level 0 errors
    L0_VCREATE_CANT_CREATE       = 'Could not create the IBFS volume.',
    L0_VCREATE_WS_ERROR          = 'A WriteStream occurred while creating the IBFS volume.', 
    L0_VCREATE_DRIVER_MISCONFIG  = 'Missing, conflicting or wrong configuration.',
    
    L0_CRYPTO_KEY_REQUIRED       = 'An AES key is required for the operation but was not provided.',
    L0_CRYPTO_KEY_CANT_DIGEST    = 'An error ocurred while digesting an AES key',
    L0_CRCSUM_MISMATCH           = "Block CRC checksum does not match the contents - Possible corruption",
    
    L0_VOPEN_UNKNOWN             = 'Could not open the IBFS volume.',
    L0_VOPEN_ROOT_DESERIALIZE    = 'Failed to deserialize the root sector data required for further driver initialization.',
    L0_VOPEN_MODE_INCOMPATIBLE   = 'The IBFS volume was not in NodeJS crypto API compatibility mode and is impossible to be decrypted by this driver',
    L0_VOPEN_SIZE_MISMATCH       = 'Volume metadata describes different IBFS volume size than what was found on the host FS - This *MEANS* data corruption or loss.', 
 
    L0_BS_ROOT_SR                = 'Could not serialize root sector data.',
    L0_BS_ROOT_DS                = 'Could not deserialize root sector data.',
    L0_BS_HEAD_SR                = 'Could not serialize head sector data.',
    L0_BS_HEAD_DS                = 'Could not deserialize head sector data.',
    L0_BS_LINK_SR                = 'Could not serialize link sector data.',
    L0_BS_LINK_DS                = 'Could not deserialize link sector data.',
    L0_BS_STORE_SR               = 'Could not serialize storage sector data.',
    L0_BS_STORE_DS               = 'Could not deserialize storage sector data.',
    L0_BS_META_SR                = 'Could not serialize volume metadata block.',
    L0_BS_META_DS                = 'Could not deserialize volume metadata block.', 

    L0_IO_UNKNOWN                = 'Unknown I/O error.', 
    L0_IO_RESOURCE_BUSY          = 'The resource is occupied by another I/O operation.',
    L0_IO_READ                   = 'Failed to read data from the disk.',
    L0_IO_READ_DS                = 'Failed to deserialize data from the disk - Data was read but failed deserialization',
    L0_IO_READ_META              = 'Failed to read volume metadata.',
    L0_IO_READ_HEAD              = 'Could not read metadata sector of a head block.',
    L0_IO_READ_HEAD_TRAIL        = 'Could not read trailing sectors of a head block.',
    L0_IO_WRITE                  = 'Failed to write data to the disk',
    L0_IO_WRITE_SR               = 'Failed to serialize data before write.',
    L0_IO_WRITE_META             = 'Could not write volume metadata.',
    L0_IO_WRITE_HEAD             = 'Failed to write the head block.',

}

export type IBFSErrorCode = keyof typeof ErrorCodes
export type IBFSErrorMetadata = { [key: string]: any }

export default class IBFSError<Code extends IBFSErrorCode = IBFSErrorCode> extends Error {

    public readonly code: Code
    public readonly rootCause?: IBFSError
    public readonly causes: Error[] = []
    public readonly meta: IBFSErrorMetadata = {}

    constructor(code: Code, message?: string | null, cause?: Error | null, meta?: IBFSErrorMetadata) {
        
        super(message || ErrorCodes[code])
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