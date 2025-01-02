import type * as T from '../../types.js'

export default class IBFSError<Code extends IBFSErrorCode = IBFSErrorCode> extends Error {

    public readonly code: Code
    public readonly causes: Error[] = []
    public readonly meta: IBFSErrorMetadata = {}
    public readonly rootCause?: IBFSError

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

export type IBFSErrorCode = keyof typeof ErrorCodes
export type IBFSErrorMetadata = { [key: string]: any }

enum ErrorCodes {

    // Scheme: LEVEL_SCOPE_ERROR_CODE_...

    // Level 1 ----------------------------------------------------------------

    L0_AES_NOKEY     = "AES key was not provided byt required by the encryption settings.",
    L0_AES_KEYDIGEST = "Failed to digest the provided AES key.",

    L0_SR_ROOTERR   = "An error occurred while serializing the root block.",
    L0_SR_METAERR   = "An error occurred while serializing the metadata cluster.",
    L0_SR_HEADERR   = "An error occurred while serializing a head block.",

    L0_DS_ROOTERR   = "An error occurred while deserializing the root block.",
    L0_DS_METAERR   = "An error occurred while deserializing the metadata cluster.",
    L0_DS_HEADERR   = "An error occurred while deserializing a head block.",

}