// Imports =============================================================================================================

import EventEmitter                         from 'node:events'

import type * as T                          from '../../../types.js'

import Memory                               from '../../L0/Memory.js'
import IBFSError                            from '../../errors/IBFSError.js'
import FileBlockMap, { TFBMOpenOptions }    from './FileBlockMap.js'
import FileReadStream, { TFRSOptions }      from './FileReadStream.js'
import FileWriteStream, { TFWSOptions }     from './FileWriteStream.js'
import DirectoryTable, { TDirectory }       from '../directory/DirectoryTables.js'
import InstanceRegistry                     from '../../caching/InstanceRegistry.js'

import ssc                                  from '../../misc/safeShallowCopy.js'
import streamFinish                         from '../../misc/streamFinish.js'

// Types ===============================================================================================================

/** 
 * File descriptor open options.
*/
export interface TFHOpenOptions extends TFBMOpenOptions {
    /** File's open mode - Read, Write, or Read/Write.               */ mode:      'r' | 'w' | 'rw'
    /** Whether writes be appended to the end of the file.           */ append?:   boolean
    /** Whether the file should be truncated on open.                */ truncate?: boolean
}

// Exports =============================================================================================================

export default interface FileHandle extends EventEmitter {
    once(event: 'close', listener: () => void): this
    on  (event: 'close', listener: () => void): this
    emit(event: 'close'): boolean
}
export default class FileHandle extends EventEmitter {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    /** File's top-level block map.                        */ public declare readonly   fbm:                FileBlockMap
    /** Original length of the file data.                  */ public declare readonly   originalLength:     number 

    /** Whether the file is currently open for reading.    */ private declare readonly _read:               boolean
    /** Whether the file is currently open for writing.    */ private declare readonly _write:              boolean
    /** Whether writes be appended to the end of the file. */ private declare readonly _append:             boolean
    /** Whether the file should be truncated on open.      */ private declare readonly _truncate:           boolean
    /** Misc counter used for the instance registry.       */ private                  _ctr                 = 0
    /** Whether the file is currently open.                */ private                  _isOpen              = false
    
    /** References read streams open on this file.         */ private _rs = new InstanceRegistry<number, FileReadStream>()
    /** References write streams open on this file.        */ private _ws = new InstanceRegistry<'stream', FileWriteStream>()


    // Factory ---------------------------------------------------------------------------------------------------------

    private constructor() {
        super()
    }

    /**
     * Opens an IBFS file handle.
     * @param options 
     * @returns FileHandle
     */
    public static async open(options: TFHOpenOptions): T.XEavA<FileHandle, 'L1_FH_OPEN'> {
        try {

            const self = new this()

            ;(self as any)._read           = ['rw', 'r'].includes(options.mode)
            ;(self as any)._write          = ['rw', 'w'].includes(options.mode)
            ;(self as any)._append         = options.append   || false
            ;(self as any)._truncate       = options.truncate || false

            // Load FBM ---------------------------
            const [fbmError, fbm] = await FileBlockMap.open(options)
            if (fbmError) return IBFSError.eav('L1_FH_OPEN', null, fbmError, ssc(options, ['containingFilesystem']))
            ;(self as any).fbm = fbm

            // Load file metadata -----------------

            // 1. Length
            const [lenErr, length] = await self.getFileLength()
            if (lenErr) return IBFSError.eav('L1_FH_OPEN', null, lenErr, ssc(options, ['containingFilesystem']))
            ;(self as any).originalLength = length

            // Finish init ------------------------
            if (self._truncate) {
                const truncError = await self.truncate(self.originalLength)
                if (truncError) return IBFSError.eav('L1_FH_OPEN', null, truncError, ssc(options, ['containingFilesystem']))
            }

            // Set open flags ---------------------
            self._isOpen = true

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

    public async close(): T.XEavSA<'L1_FH_CLOSE'> {
        try {

            // Fail silently if the file is already closed or is still busy.
            if (!this._isOpen) return new IBFSError('L1_FH_CLOSE', 'The handle is already closed')
            if (this._isBusy()) return new IBFSError('L1_FH_CLOSE', `Can't close the handle because it's busy. Wait for`
                +` all read/write activity to finish or close all active streams before closing.`)

            this.emit('close')
            this._isOpen = false

        } 
        catch (error) {
            return new IBFSError('L1_FH_CLOSE', null, error as Error)
        }
    }

    // I/O methods -----------------------------------------------------------------------------------------------------

    /**
     * Reads the full contents of the file and returns the resulting buffer. 
     * This is potentially really memory intensive and should be avoided in favor
     * of `createReadStream()` whenever dealing with large files.
     * @param integrity Whether to perform data integrity checks.
     * @returns [Error?, Buffer?]
     */
    public async readFile(integrity = true): T.XEavA<Buffer, 'L1_FH_READ'|'L1_FH_READ_MODE'|'L1_FH_BUSY'> {
        try {

            if (!this._read) return IBFSError.eav('L1_FH_READ_MODE')
            if (this._isBusy()) return IBFSError.eav('L1_FH_BUSY')

            const fs = this.fbm.containingFilesystem
            const memory = Memory.allocUnsafe(fs.volume.bs.DATA_CONTENT_SIZE * this.fbm.length)

            const [streamError, stream] = await this.createReadStream({ maxChunkSize: fs.volume.bs.DATA_CONTENT_SIZE, integrity })
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
    public async read(offset: number, length: number, integrity = true): T.XEavA<Buffer, 'L1_FH_READ'|'L1_FH_READ_MODE'|"L1_FH_BUSY">  {
        try {

            if (!this._read) return IBFSError.eav('L1_FH_READ_MODE')
            if (this._isBusy()) return IBFSError.eav('L1_FH_BUSY')
        
            const memory = Memory.allocUnsafe(length)

            const [streamError, stream] = await this.createReadStream({ offset, length, integrity, maxChunkSize: length })
            if (streamError) return IBFSError.eav('L1_FH_READ', null, streamError)

            for await (const chunk of stream) memory.write(chunk)
            return [null, memory.readFilled()]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ', null, error as Error)
        }
    }

    /**
     * Overwrites the contents of the file.
     * @param data Data to write
     * @returns Error | undefined
     */
    public async writeFile(data: Buffer): T.XEavSA<'L1_FH_WRITE_FILE'|'L1_FH_WRITE_MODE'|'L1_FH_BUSY'> {
        try {

            if (!this._write) return new IBFSError('L1_FH_WRITE_MODE')
            if (this._isBusy()) return new IBFSError('L1_FH_BUSY')

            const [lenError, fileLength] = await this.getFileLength()
            if (lenError) return new IBFSError('L1_FH_WRITE_FILE', null, lenError)

            if (data.length < fileLength) {
                const error = await this.truncate(data.length)
                if (error) return new IBFSError('L1_FH_WRITE_FILE', null, error)
            }

            const [wsError, ws] = await this.createWriteStream({ offset: 0 })
            if (wsError) return new IBFSError('L1_FH_WRITE_FILE', null, wsError)

            ws.write(data)
            ws.end()
            await streamFinish(ws)

        } 
        catch (error) {
            return new IBFSError('L1_FH_WRITE_FILE', null, error as Error)    
        }
    }

    /**
     * Writes data at a specified offset. If `offset+data.length` are larger than the file, the file will be extended.
     * If the offset is outside the file an error will be returned and no data will be written.
     * @param data Data to write.
     * @param offset Offset at which to start writing.
     * @returns 
     */
    public async write(data: Buffer, offset: number): T.XEavSA<'L1_FH_WRITE'|'L1_FH_WRITE_MODE'|'L1_FH_BUSY'> {
        try {

            if (!this._write) return new IBFSError('L1_FH_WRITE_MODE')
            if (this._isBusy()) return new IBFSError('L1_FH_BUSY')

            const [wsError, ws] = await this.createWriteStream({ offset })
            if (wsError) return new IBFSError('L1_FH_WRITE', null, wsError)

            ws.write(data)
            ws.end()
            await streamFinish(ws)
            
        } 
        catch (error) {
            return new IBFSError('L1_FH_WRITE', null, error as Error)
        }
    }

    /**
     * Appends data at the end of the file.
     */
    public async append(data: Buffer): T.XEavSA<'L1_FH_APPEND'|'L1_FH_WRITE_MODE'|'L1_FH_BUSY'> {
        try {

            if (!this._write) return new IBFSError('L1_FH_WRITE_MODE')
            if (this._isBusy()) return new IBFSError('L1_FH_BUSY')

            const [lenError, fileLength] = await this.getFileLength()
            if (lenError) return new IBFSError('L1_FH_APPEND', null, lenError)
            
            const [wsError, ws] = await this.createWriteStream({ offset: fileLength })
            if (wsError) return new IBFSError('L1_FH_APPEND', null, wsError)

            ws.write(data)
            ws.end()
            await streamFinish(ws)
            
        } 
        catch (error) {
            return new IBFSError('L1_FH_APPEND', null, error as Error)    
        }
    }

    /**
     * Truncates the file to a specified length. If the length specified 
     * is larger than the file, an error will be returned.
     */
    public async truncate(length: number): T.XEavSA<'L1_FH_TRUNC'|'L1_FH_TRUNC_OUTRANGE'|'L1_FH_TRUNC_MODE'|'L1_FH_BUSY'> {

        if (!this._write) return new IBFSError('L1_FH_TRUNC_MODE')
        if (this._isBusy()) return new IBFSError('L1_FH_BUSY')

        const [lenError, fileLength] = await this.getFileLength()
        if (lenError) return new IBFSError('L1_FH_TRUNC', null, lenError)
        if (length > fileLength) return new IBFSError('L1_FH_TRUNC_OUTRANGE', null, null, { truncLength: length, fileLength })

        const fs = this.fbm.containingFilesystem
        const leftoverBlocks = Math.ceil(length / fs.volume.bs.DATA_CONTENT_SIZE)
        const tailBlockBytes = length % fs.volume.bs.DATA_CONTENT_SIZE

        const fbmTruncError = await this.fbm.truncTo(leftoverBlocks)
        if (fbmTruncError) return new IBFSError('L1_FH_TRUNC', null, fbmTruncError)

        const tailAddress = this.fbm.get(leftoverBlocks-1)!
        const [readError, tailBlock] = await fs.volume.readDataBlock(tailAddress, fs.aesKey)
        if (readError) return new IBFSError('L1_FH_TRUNC', null, readError)

        const remainingBody = tailBlock.data.subarray(tailBlockBytes)
        const writeError = await fs.volume.writeDataBlock({
            data: remainingBody,
            aesKey: fs.aesKey,
            address: tailAddress,
        })

        if (writeError) return new IBFSError('L1_FH_TRUNC', null, writeError)

    }

    /**
     * Reads the entire contents of the file and parses its directory content.
     * Returns an error if the handle wasn't opened on a directory.
     */
    public async readAsDir(integrity = true): T.XEavA<TDirectory, 'L1_FH_DIR_READ'|'L1_FH_READ_MODE'|'L1_FH_BUSY'|'L1_FH_DIR_READ_TYPE'> {
        try {

            if (this.type !== 'DIR') return IBFSError.eav('L1_FH_DIR_READ_TYPE')
            if (!this._read) return IBFSError.eav('L1_FH_READ_MODE')
            if (this._isBusy()) return IBFSError.eav('L1_FH_BUSY')

            const fs = this.fbm.containingFilesystem
            const memory = Memory.allocUnsafe(fs.volume.bs.DATA_CONTENT_SIZE * this.fbm.length)

            const [streamError, stream] = await this.createReadStream({ maxChunkSize: fs.volume.bs.DATA_CONTENT_SIZE, integrity })
            if (streamError) return IBFSError.eav('L1_FH_DIR_READ', null, streamError)

            for await (const chunk of stream) memory.write(chunk)

            const buffer = memory.readFilled()
            const dir = DirectoryTable.deserializeDRTable(buffer)
            return [null, dir]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_DIR_READ', null, error as Error)
        }
    }

    /**
     * Writes a directory structure to the underlying handle's contents.
     * This method assumes the handle was opened for a directory and will return an error if it wasn't.
     */
    public async writeAsDir(dir: TDirectory): T.XEavSA<'L1_FH_DIR_WRITE'|'L1_FH_WRITE_MODE'|'L1_FH_BUSY'|'L1_FH_DIR_WRITE_TYPE'> {
        try {

            if (this.type !== 'DIR') return new IBFSError('L1_FH_DIR_WRITE_TYPE')
            if (!this._write) return new IBFSError('L1_FH_WRITE_MODE')
            if (this._isBusy()) return new IBFSError('L1_FH_BUSY')

            const data = DirectoryTable.serializeDRTable(dir)

            const [lenError, fileLength] = await this.getFileLength()
            if (lenError) return new IBFSError('L1_FH_DIR_WRITE', null, lenError)

            if (data.length < fileLength) {
                const error = await this.truncate(data.length)
                if (error) return new IBFSError('L1_FH_DIR_WRITE', null, error)
            }

            const [wsError, ws] = await this.createWriteStream({ offset: 0 })
            if (wsError) return new IBFSError('L1_FH_DIR_WRITE', null, wsError)

            ws.write(data)
            ws.end()
            await streamFinish(ws)
            
        } 
        catch (error) {
            return new IBFSError('L1_FH_DIR_WRITE', null, error as Error)
        }
    }

    // Core ------------------------------------------------------------------------------------------------------------

    /**
     * Creates a readable stream of the file's contents.  
     * **NOTE:** The returned stream is not inherently error-safe. It **CAN** throw errors
     * when reading from the file and should always be handled from within a try/catch block.
     */
    public async createReadStream(options: TFRSOptions = {}): 
        T.XEavA<FileReadStream, 'L1_FH_READ_STREAM'|"L1_FH_READ_STREAM_BUFFER"|'L1_FH_READ_MODE'|'L1_FH_READ_STREAM_EXREF'> {
        try {

            if (!this._read) return IBFSError.eav('L1_FH_READ_MODE')
            if (this._ws.activeCount() > 0) return IBFSError.eav('L1_FH_READ_STREAM_EXREF')

            const [error, stream] = await FileReadStream.open(this, options)
            if (error) return IBFSError.eav('L1_FH_READ_STREAM', null, error)

            this._manageStream(stream)
            return [null, stream]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_READ_STREAM', null, error as Error)
        }
    }

    /**
     * Creates writable stream allowing for writing to the file.
     * **NOTE:** The returned stream is not inherently error-safe. It **CAN** throw errors
     * when reading from the file and should always be handled from within a try/catch block.
     */
    public async createWriteStream(options: TFWSOptions = {}): T.XEavA<FileWriteStream, 'L1_FH_WRITE_STREAM'|'L1_FH_WRITE_STREAM_EXREF'|'L1_FH_WRITE_MODE'> {
        try {

            if (!this._write) return IBFSError.eav('L1_FH_WRITE_MODE')
            if (this._ws.activeCount() > 0) return IBFSError.eav('L1_FH_WRITE_STREAM_EXREF')
            if (this._rs.activeCount() > 0) return IBFSError.eav('L1_FH_WRITE_STREAM_EXREF')

            let offset = options.offset
            if (this._append) {
                const [lenError, fileLength] = await this.getFileLength()
                if (lenError) return IBFSError.eav('L1_FH_WRITE_STREAM', null, lenError)
                offset = fileLength
            }
            
            const [error, stream] = await FileWriteStream.open(this, { ...options, offset })
            if (error) return IBFSError.eav('L1_FH_WRITE_STREAM', null, error)

            this._manageStream(stream)

            return [null, stream]

        } 
        catch (error) {
            return IBFSError.eav('L1_FH_WRITE_STREAM', null, error as Error)
        }
    }

    /**
     * Manages the stream lifecycle and locking of the file handle
     * based on the number of active streams.
     */
    private _manageStream(stream: FileReadStream | FileWriteStream) {

        if (stream instanceof FileWriteStream) {
            const streamMeta = { 
                "File address": stream._handle.fbm.startingAddress, 
                "Commit frequency": stream._fbmCommitFrequency 
            }
            this._ws.addRef('stream', stream, streamMeta)
            stream.once('end',   () => this._ws.removeRef('stream'))
            stream.once('close', () => this._ws.removeRef('stream'))
            stream.once('error', () => this._ws.removeRef('stream'))
        }
        else {
            const streamMeta = { 
                "File address": stream._handle.fbm.startingAddress, 
                "Integrity": stream._integrity
            }
            const ctr = this._ctr++
            this._rs.addRef(ctr, stream, streamMeta)
            const cleanup = () => this._rs.removeRef(ctr)
            stream.once('end',   cleanup)
            stream.once('close', cleanup)
            stream.once('error', cleanup)
        }
    }

    /**
     * Returns whether the file handle is currently in use.
     */
    private _isBusy(): boolean {
        return this._rs.activeCount() > 0 || 
               this._ws.activeCount() > 0
    }

    // Helpers ---------------------------------------------------------------------------------------------------------

    /**
     * Returns number of bytes stored inside the data blocks.
     */
    public async getFileLength(): T.XEavA<number, "L1_FH_GET_FILE_LENGTH"> {
        try {
            
            const fs = this.fbm.containingFilesystem

            const lastIndex = this.fbm.items.at(-1)?.block!
            const lastDataBlockAddress = lastIndex.get(lastIndex.length-1)!

            const [err, lastDataBlock] = await fs.volume.readDataBlock(lastDataBlockAddress, fs.aesKey)
            if (err) return IBFSError.eav('L1_FH_GET_FILE_LENGTH', null, err)

            const dataLength = lastDataBlock.length + ((this.fbm.length-1) * fs.volume.bs.DATA_CONTENT_SIZE)
            
            return [null, dataLength]
            
        } 
        catch (error) {
            return IBFSError.eav('L1_FH_GET_FILE_LENGTH', null, error as Error)
        }
    }

}


