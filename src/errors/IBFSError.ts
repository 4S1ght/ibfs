enum ErrorCodes {
    
    // Level 0 errors
    L0_VCREATE_CANT_CREATE  = 101, // Can't create an IBFS volume
    L0_CSUM_MISMATCH        = 102, // Sector checksum mismatch likely indicating data corruption inside a sector.

}

type ErrorCode = keyof typeof ErrorCodes
type ErrorMetadata = { [key: string]: any }

export default class IBFSError<Code extends ErrorCode = ErrorCode> extends Error {

    public readonly errno: number
    public readonly code: Code
    public readonly causes: Error[] = []
    public readonly meta: ErrorMetadata = {}

    constructor(code: Code, message?: string, cause?: Error | null, meta?: ErrorMetadata) {
        
        super(message)
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