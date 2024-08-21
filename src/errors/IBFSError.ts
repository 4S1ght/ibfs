enum ErrorCodes {
    
    // Level 0 errors
    L0_CREATE_CANT_CREATE = 101

}

type ErrorCode = keyof typeof ErrorCodes
type ErrorMetadata = { [key: string]: any }

export default class IBFSError extends Error {

    public readonly errno: number
    public readonly code: ErrorCode
    public readonly causes: Error[] = []
    public readonly meta: ErrorMetadata = {}

    constructor(code: ErrorCode, message?: string, cause?: Error, meta?: ErrorMetadata) {
        
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