// Imports =============================================================================================================

import type * as T from '../../../types.js'

import Memory from '../../L0/Memory.js'
import IBFSError from '../../errors/IBFSError.js'
import FileBlockMap, { TFBMOpenOptions } from './FileBlockMap.js'
import FileReadStream, { TFRSOptions } from './FileReadStream.js'

import ssc from '../../misc/safeShallowCopy.js'
import toLookup from '../../misc/lookup.js'
import FileWriteStream, { TFWSOptions } from './FileWriteStream.js'

// Types ===============================================================================================================

/** 
 * File descriptor open options.
*/
export interface TFHOpenOptions extends TFBMOpenOptions {
    /** File's open mode - Read, Write, or Read/Write.               */ mode:     'r' | 'w' | 'rw'
    /** Whether writes be appended to the end of the file.           */ append:   boolean
    /** Whether the file should be truncated on open.                */ truncate: boolean
    /** Whether the file should be created on open (fails if exists) */ create:   boolean
}

// Exports =============================================================================================================

export default class FileHandle {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    /** File's top-level block map.                              */ public declare readonly fbm:            FileBlockMap
    /** Length of the usable file data (not including overhead)  */ public declare readonly originalLength: number

    /** File's open mode - Read, Write, or Read/Write.           */ public declare readonly _mode:           'r' | 'w' | 'rw'
    /** Whether writes be appended to the end of the file.       */ public declare readonly _append:         boolean
    /** Whether the file should be truncated on open.            */ public declare readonly _truncate:       boolean
    /** Whether the file should be created on open.              */ public declare readonly _create:         boolean

    // Factory ---------------------------------------------------------------------------------------------------------

    private constructor() {}

    /**
     * Opens an IBFS file descriptor.
     * @param options 
     * @returns FileHandle
     */
    public static async open(options: TFHOpenOptions): T.XEavA<FileHandle, 'L1_FH_OPEN'> {
        try {

            const self = new this()

            ;(self as any)._mode           = options.mode
            ;(self as any)._append         = options.append
            ;(self as any)._truncate       = options.truncate
            ;(self as any)._create         = options.create

            // Check file locks -------------------
            // TODO

            // Lock file --------------------------
            // TODO

            // Load FBM ---------------------------

            const [fbmError, fbm] = await FileBlockMap.open(options)
            if (fbmError) return IBFSError.eav('L1_FH_OPEN', null, fbmError, ssc(options, ['containingFilesystem']))
            ;(self as any).fbm = fbm

            // Load file metadata -----------------
            const [lenErr, length] = await self.fbm.dataLength()
            if (lenErr) return IBFSError.eav('L1_FH_OPEN', null, lenErr)
            ;(self as any).originalLength = length

            return [null, self]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_OPEN', null, error as Error)
        }
    }

    /** Returns the type of the file structure. */
    public get type() { return this.fbm.root.resourceType }
    /** The time the file was created. */
    public get created() { return this.fbm.root.created }
    /** The time the file was last modified. */
    public get modified() { return this.fbm.root.modified }

    // Lifecycle -------------------------------------------------------------------------------------------------------

    public async close() {

        // Lift the lock ----------------------------
        // TODO

        // Remove reference from open files list ----
    }

    // I/O methods -----------------------------------------------------------------------------------------------------

    /**
     * Reads the full contents of the file and returns the resulting buffer. 
     * This is potentially really memory intensive and should be avoided in favor
     * of `createReadStream()` whenever dealing with large files.
     * @param integrity Whether to perform data integrity checks.
     * @returns [Error?, Buffer?]
     */
    public async readFile(integrity = true): T.XEavA<Buffer, 'L1_FH_READ'> {
        try {

            const fs = this.fbm.containingFilesystem
            const memory = Memory.alloc(fs.volume.bs.DATA_CONTENT_SIZE * this.fbm.length)

            const [streamError, stream] = this.createReadStream({ maxChunkSize: fs.volume.bs.DATA_CONTENT_SIZE })
            if (streamError) return IBFSError.eav('L1_FH_READ', null, streamError)

            for await (const chunk of stream) memory.write(chunk)
            return [null, memory.readFilled()]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ', null, error as Error)
        }
    }

    /**
     * Reads a specific part of the file and returns the resulting buffer.
     * @param offset Offset at which to start reading the file.
     * @param length Number of bytes to read from the offset (May result in shorter values if file ends early).
     * @param integrity Whether to perform data integrity checks.
     * @returns [Error?, Buffer?]
     */
    public async read(offset: number, length: number, integrity = true): T.XEavA<Buffer, 'L1_FH_READ'>  {
        try {
        
            const memory = Memory.alloc(length)

            const [streamError, stream] = this.createReadStream({ offset, length, integrity, maxChunkSize: length })
            if (streamError) return IBFSError.eav('L1_FH_READ', null, streamError)

            for await (const chunk of stream) memory.write(chunk)
            return [null, memory.readFilled()]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ', null, error as Error)
        }
    }

    public async writeFile(data: Buffer): T.XEavSA<'L1_FH_WRITE_FILE'> {
        try {

        } 
        catch (error) {
            return new IBFSError('L1_FH_WRITE_FILE', null, error as Error)    
        }
    }

    public async write() {}

    public async append() {}

    /**
     * Truncates the file to a specific length.
     */
    public async truncate(length: number): T.XEavSA<'L1_FH_TRUNCATE'> {

        // TODO
        // Calculate which block would remain last in the file, modify
        // it's length, and free the addresses of the remaining blocks

    }

    /**
     * Creates a readable stream of the file's contents.  
     * **NOTE:** The returned stream is not inherently error-safe. It **CAN** throw errors
     * when reading from the file and should always be handled from within a try/catch block
     * @returns [Error?, Readable?]
     */
    public createReadStream(options: TFRSOptions = {}): 
        T.XEav<FileReadStream, 'L1_FH_READ_STREAM'|"L1_FH_READ_STREAM_BUFFER"> {
        try {
            const stream = new FileReadStream(this, options)
            return [null, stream]
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ_STREAM', null, error as Error)
        }
    }

    public createWriteStream(options: TFWSOptions = {}): T.XEav<FileWriteStream, 'L1_FH_WRITE_STREAM'> {
        try {
            const stream = new FileWriteStream(this, options)
            return [null, stream]
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_WRITE_STREAM', null, error as Error)
        }
    }

    // Helpers ---------------------------------------------------------------------------------------------------------

}
