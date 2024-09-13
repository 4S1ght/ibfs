enum ErrorCodes {
    
    // Level 0 errors
    L0_VCREATE_CANT_CREATE      = 101, // Can't create an IBFS volume
    L0_VCREATE_WS_ERROR         = 102, // Write stream error ocurred while the volume was being created.
    L0_CRCSUM_MISMATCH          = 103, // CRC error detection triggered wen deserializing a data block.

    L0_BS_CANT_SERIALIZE_ROOT   = 104, // Problem serializing a root sector.
    L0_BS_CANT_DESERIALIZE_ROOT = 105, // Problem deserializing a root sector.
    L0_BS_CANT_SERIALIZE_HEAD   = 106, // Problem serializing a head block.
    L0_BS_CANT_DESERIALIZE_HEAD = 107, // Problem deserializing a head block.

    L0_BS_CANT_SERIALIZE_LINK   = 108, // Problem serializing a link block.
    L0_BS_CANT_DESERIALIZE_LINK = 109, // Problem serializing a link block.

    L0_BS_CANT_SERIALIZE_META   = 110, // Problem serializing   metadata block.
    L0_BS_CANT_DESERIALIZE_META = 111, // Problem deserializing metadata block.

}

type ErrorCode = keyof typeof ErrorCodes
type ErrorMetadata = { [key: string]: any }

export default class IBFSError<Code extends ErrorCode = ErrorCode> extends Error {

    public readonly errno: number
    public readonly code: Code
    public readonly causes: Error[] = []
    public readonly meta: ErrorMetadata = {}

    constructor(code: Code, message?: string|null, cause?: Error | null, meta?: ErrorMetadata) {
        
        super(message || undefined)
        this.name = this.constructor.name
        this.code = code
        this.errno = ErrorCodes[code]
        meta && (this.meta = meta)
        
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

}