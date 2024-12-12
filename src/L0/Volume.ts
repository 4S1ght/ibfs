// TODOs
// - Add block type checks (check block type int8 on block reads) to prevent misreads & corruption.
//
// Imports ========================================================================================

import * as T from "@types"

import path                 from "node:path"
import fss                  from "node:fs"
import fs                   from "node:fs/promises"
import crypto               from "node:crypto"
import type { WriteStream } from "node:fs"

import AES, { AESCipher }   from "@L0/AES.js"
import Memory               from "@L0/Memory.js"
import IBFSError            from "@errors"
import * as m               from "@misc"
import * as C               from "@constants"

import Serialize, { 
    CommonReadMeta, 
    CommonWriteMeta, 
    HeadBlock, 
    LinkBlock, 
    RootSector, 
    SectorSize, 
    StorageBlock
} from "@L0/Serialize.js"

// Types ==========================================================================================

export interface EmptyVolumeInit extends VolumeMetadata {
    /** The location of the virtual disk file. */
    file: string
    /** Size of individual sectors inside the virtual disk file. */
    sectorSize: SectorSize
    /** Number of usable data sectors inside the virtual disk file - includes volume metadata (128kiB) and root sector. */
    sectorCount: number
    /** AES cipher used. Leave empty for no encryption. */
    aesCipher: keyof typeof AESCipher
    /** AES encryption key used. */
    aesKey?: Buffer | string
    /** Progress update configuration. */
    update: {
        /** 
         * Specifies every how many bytes written to the disk to call an update callback. 
         * @default 5_000_000
         */
        frequency?: number
        /** A callback called on each update as the volume is being created. */
        onUpdate: (written: number) => any
    }
}

interface VolumeMetadata {
    /** IBFS driver configuration. */
    driver?: {
        /** 
         * Specifies the size of individual chunks the pool of free sector addresses is split into.
         * These chunks are loaded into memory individually while the rest is stored on the disk
         * next to the IBFS volume similarly to SWAP memory. This helps preserve system memory
         * when large volumes are open.
         * @default 32768 // (8 bytes per address X 32768 = 256kiB memory used)
         */
        addressStackChunkSize?: number
        /** 
         * Specifies the number of addresses left from draining or filling a stack chunk that must 
         * be reached before another chunk is preloaded into memory.
         * @default 1024
         */
        chunkPreloadMark?: number
        /** 
         * Specifies the number of addresses left from draining or filling a stack chunk that must 
         * be reached before another chunk is unloaded onto the disk.
         * This value **must** be higher than that of `chunkPreloadMark`.
         * @default 2048
         */
        chunkUnloadMark?: number
    }
}

type VolumeCreateStatus = 
    | 'setup'
    | 'bootstrap'
    | 'write'
    | 'done'

// Module =========================================================================================

export default class Volume {

    private declare handle: fs.FileHandle
    private declare bs: Serialize
    public  declare rs: RootSector

    /** 
     * Lock used for locking the metadata sector.
     * While file locking happens on higher levels, implementing metadata block locking 
     * there would introduce needless complexity as this block is not expected to
     * receive high traffic - It's used exclusively to store arbitrary driver configuration.
     */
    private mLock = new m.Lock(10_000)

    // Static =================================================================

    /** 
     * Returns the number of sectors required to accommodate the minimum of 
     * 128kB of space for volume metadata.
     */
    public static getMetaSectorCount(blockSize: number) {
        return Math.ceil(1024*128 / blockSize)
    }


    // Factory ================================================================

    private constructor() {}

    /**
     * Creates an empty volume in a specified location.
     * @param init Initial volume information.
     * @returns Error (if occurred)
     */
    public static async createEmptyVolume(init: EmptyVolumeInit): T.EavSA<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {

            // Setup ================================================

            const updateFrequency = init.update.frequency || 5_000_000 // Bytes

            // Ensure file EXT
            if (path.extname(init.file) !== C.VD_FILE_EXT) init.file != C.VD_FILE_EXT

            // Root sector ==========================================

            const aesIV = crypto.randomBytes(16)
            const [aesKeyError, aesKey] = AES.deriveAESKey(init.aesCipher, init.aesKey)
            if (aesKeyError) return aesKeyError

            // deps setup
            const serialize = new Serialize({ 
                diskSectorSize: init.sectorSize,
                cipher: init.aesCipher,
                iv: aesIV
            })

            // Deps
            const metaSectors = this.getMetaSectorCount(init.sectorSize)

            // Creates the key check buffer used later to verify the correctness of
            // user supplied decryption key.
            const aesKeyCheck = (() => {
                if (!init.aesCipher) return Buffer.alloc(16)
                return serialize.AES.encrypt(Buffer.alloc(16), aesKey, 0)
            })()

            // Root sector
            const [rootError, rootSector] = Serialize.createRootSector({
                specMajor:              C.FS_SPEC[0],
                specMinor:              C.FS_SPEC[1],
                sectorSize:             init.sectorSize,
                sectorCount:            init.sectorCount,
                metadataSectors:        metaSectors,
                aesCipher:              AESCipher[init.aesCipher || ''],
                aesIV:                  aesIV,
                cryptoCompatMode:       true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          0
            })           
            if (rootError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, rootError, m.ssc(init, ['aesKey']))


            // Meta block ===========================================

            const metadata = {
                memoryPoolSwapSize: m.deep(() => init.driver?.addressStackChunkSize, 32768),
                chunkUnloadMark:    m.deep(() => init.driver?.chunkUnloadMark, 1024),
                chunkPreloadMark:   m.deep(() => init.driver?.chunkPreloadMark, 2048)
            }

            if (metadata.chunkPreloadMark >= metadata.chunkUnloadMark)
                return new IBFSError(
                    'L0_VCREATE_DRIVER_MISCONFIG', 
                    `Chunk preload mark must greater than the unload mark.`, 
                    null, m.ssc(init, ['aesKey'])
                )

            const [metaError, metaBlock] = serialize.createMetaBlock({ ibfs: metadata })
            if (metaError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, metaError, m.ssc(init, ['aesKey']))

            // Fill =================================================

            // Fix: Windows won't consistently create the IBFS file with W+ flag,
            // so an empty one needs to be created in advance.
            const fileError = await Volume.ensureEmptyFile(init.file)
            if (fileError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, fileError, m.ssc(init, ['aesKey']))

            file = await fs.open(init.file, 'w+', 0o600)
            ws = file.createWriteStream({ highWaterMark: init.sectorSize * 192 })

            const empty = Buffer.alloc(init.sectorSize)
            let canWrite = true
            let broken = false
            let wsError: { i: number, error: Error }

            let { bytesWritten: bw } = await file.write(Buffer.concat([
                rootSector,
                metaBlock
            ]))

            for (let i = metaSectors+1; i < init.sectorCount; i++) {

                if (broken) break

                canWrite = ws.write(empty, error => {
                    if (error && !broken) {
                        broken = true
                        wsError = { i, error }
                        ws.close()
                        file.close()
                    }
                })

                if (!canWrite) await new Promise<void>(resume => ws.on('drain', () => {
                    ws.removeAllListeners('drain')
                    resume()
                }))

                if (ws.bytesWritten - bw >= updateFrequency) {
                    init.update.onUpdate(ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

            if (wsError!) {
                return new IBFSError('L0_VCREATE_WS_ERROR', null, wsError.error, m.ssc({ ...init, failedAtSector: wsError.i }, ['aesKey', 'update']))
            }

        } 
        catch (error) {
            console.log(error)
            return new IBFSError('L0_VCREATE_CANT_CREATE', null, error as Error, m.ssc(init, ['aesKey', 'update']))
        }
        finally {
            if (ws!) ws.close()
            if (file!) await file.close()
        }
    }

    /**
     * Opens an IBFS volume and exposes a low-level IO API for manipulating raw data.
     * @param image IBFS volume image path
     * @returns [Error | Volume]
     */
    public static async open(image: string): 
        T.XEavA<Volume, 'L0_VOPEN_ROOT_DESERIALIZE'|'L0_VOPEN_MODE_INCOMPATIBLE'|'L0_VOPEN_SIZE_MISMATCH'|'L0_VOPEN_UNKNOWN'> {

        const self = new this()

        try {

            self.handle = await fs.open(image, 'r+')

            const rsData = Buffer.alloc(1024)
            await self.handle.read({ offset: 0, length: 1024, buffer: rsData })
            const [rsError, rs] = Serialize.readRootSector(rsData)

            if (rsError)                       return IBFSError.eav('L0_VOPEN_ROOT_DESERIALIZE', null, rsError, { image })
            if (rs.cryptoCompatMode === false) return IBFSError.eav('L0_VOPEN_MODE_INCOMPATIBLE', null, null, { image })

            const expectedVolumeSize = rs.sectorSize*rs.sectorCount
            const { size } = await self.handle.stat()

            if (size !== expectedVolumeSize) return IBFSError.eav('L0_VOPEN_SIZE_MISMATCH', null, null, { size, expectedVolumeSize, diff: Math.abs(size - expectedVolumeSize) })

            self.bs = new Serialize({
                diskSectorSize: rs.sectorSize,
                cipher: AES.getCipher(rs.aesCipher),
                iv: rs.aesIV
            })

            self.rs = rs
            return [null, self]
        } 
        catch (error) {
            if (self.handle) await self.handle.close()
            return [new IBFSError('L0_VOPEN_UNKNOWN', null, error as Error, { image }), null] 
        }
    }

    // Misc ===================================================================

    private async read(position: number, length: number): T.XEavA<Buffer, 'L0_IO_READ'> {
        try {
            const buffer = Buffer.allocUnsafe(length)
            const result = await this.handle.read({ position, length, buffer })
            return [null, result.buffer]
        } 
        catch (error) {
            return IBFSError.eav('L0_IO_READ', null, error as Error, { position, length })
        }
    }

    private async write(position: number, data: Buffer): T.XEavSA<'L0_IO_WRITE'> {
        try {
            await this.handle.write(data, 0, data.length, position)
        } 
        catch (error) {
            return new IBFSError('L0_IO_WRITE', null, error as Error, { position })
        }
    }

    // I/O ====================================================================
    
    /**
     * Overwrites the root sector of the filesystem.
     * 
     * **DO NOT USE THIS**  
     * This method if only for use internally within the driver.  
     * Any errors or misconfiguration will likely cause data corruption that is
     * especially hard to recover from when using full volume encryption.
     * @param root Root sector data
     * @returns Error?
     */
    public async overwriteRootSector(root: RootSector): T.XEavSA<'L0_ROOT_CANT_OVERWRITE'|'L0_BS_ROOT_SR'> {
        try {

            const [rsError, rs] = Serialize.createRootSector(root)
            if (rsError) return new IBFSError('L0_BS_ROOT_SR', null, rsError)

            const writeError = await this.write(0, rs)
            if (writeError) return new IBFSError('L0_ROOT_CANT_OVERWRITE', null, writeError)

            this.rs = root

        }
        catch (error) {
            return new IBFSError('L0_ROOT_CANT_OVERWRITE', null, error as Error)
        }
    }

    /**
     * Reads the metadata block and returns its data.  
     * If the metadata block os occupied (read from/written to) by 
     * a different part of the program an error will be returned.
     * @returns [Error?, Data?]
     */
    public async readMetaBlock<Meta extends Object = Object>(): 
        T.XEavA<Meta, 'L0_IO_RESOURCE_BUSY'|'L0_IO_READ_META'|'L0_IO_READ_DS'|'L0_IO_UNKNOWN'> {

        const lock = this.mLock.acquire()
        if (!lock) return IBFSError.eav('L0_IO_RESOURCE_BUSY')

        try {
            const position = this.bs.resolveAddr(1)
            const [readError, metaBlock] = await this.read(position, this.bs.META_SIZE)
            if (readError) return IBFSError.eav('L0_IO_READ_META', null, readError)

            const [dsError, data] = this.bs.readMetaBlock<Meta>(metaBlock)
            if (dsError) return IBFSError.eav('L0_IO_READ_DS', null, dsError)
            
            return [null, data]
        }
        catch (error) {
            return IBFSError.eav('L0_IO_UNKNOWN', null, error as Error)
        }
        finally {
            lock.release()
        }

    }

    /**
     * Overwrites the data in the metadata block.
     * If the metadata block os occupied (read from/written to) by 
     * a different part of the program an error will be returned.
     * @returns Error?
     */
    public async writeMetaBlock(meta: Object): 
        T.XEavSA<'L0_IO_RESOURCE_BUSY'|'L0_IO_WRITE_SR'|'L0_IO_WRITE_META'|'L0_IO_UNKNOWN'> {

        const lock = this.mLock.acquire()
        if (!lock) return new IBFSError('L0_IO_RESOURCE_BUSY')

        try {
            const [sError, data] = this.bs.createMetaBlock(meta)
            if (sError) return new IBFSError('L0_IO_WRITE_SR', null, sError)

            const position = this.bs.resolveAddr(1)
            const writeError = await this.write(position, data)
            if (writeError) return new IBFSError('L0_IO_WRITE_META', null, writeError)
        }
        catch (error) {
            return new IBFSError('L0_IO_UNKNOWN', null, error as Error)
        }
        finally {
            lock.release()
        }
        
    }


    /**
     * Returns a head block after reading it from the disk, deserializing and decrypting it.
     * @param address Block address
     * @param aesKey Decrypt key
     * @param integrity Whether to check for CRC integrity - Only use for recovery.
     * @returns [Error?, Data?]
     */
    public async readHeadBlock(address: number, aesKey?: Buffer, integrity = true):
        T.XEavA<HeadBlock & CommonReadMeta, 'L0_IO_UNKNOWN'|'L0_IO_READ_HEAD'|'L0_IO_READ_DS'|'L0_IO_READ_HEAD_TAIL'|'L0_CRCSUM_MISMATCH'> {
        try {
            
            const headPosition = this.bs.resolveAddr(address)
            const [headError, headSector] = await this.read(headPosition, this.bs.SECTOR_SIZE)
            if (headError) return IBFSError.eav('L0_IO_READ_HEAD', null, headError, { address })

            const head = this.bs.readHeadBlock(headSector, address, aesKey)
            if (head.error) return IBFSError.eav('L0_IO_READ_DS', 'Head sector was read but could not be deserialized.', head.error, { address })

            type Meta = Required<typeof head['meta']>

            // Resolve early if head is a single-sector block
            if (head.meta.blockSize === 0) {
                head.final()
                return [null, head.meta as Meta]
            }

            // Continue if found to have tailing sectors.
            const tailPosition = this.bs.resolveAddr(address+1)
            const [tailError, tailSectors] = await this.read(tailPosition, this.bs.SECTOR_SIZE * head.meta.blockSize)
            if (tailError) return IBFSError.eav('L0_IO_READ_HEAD_TAIL', null, tailError, { address })
            
            const finalError = head.final(tailSectors)
            if (finalError) return IBFSError.eav('L0_IO_READ_DS', 'Could not finalize deserialization of the head block.', finalError, { address })

            if (integrity && (head.meta as Meta).crcMismatch) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address })
        
            return [null, head.meta as Meta]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_UNKNOWN', null, error as Error, { address })
        }
    }   
    
    /**
     * Serializes a head block and writes it to the disk.  
     * 
     * **Important** - The size of usable `data` must be determined in advance and match the `blockSize`.  
     * A mismatch will result in either an error or truncated data being written to the disk which may cause data loss.
     * There must be enough user data to occupy all of the sectors in the block, but not overflow it. The last sector in 
     * the block the does not have to be filled entirely and will be padded if needed.
     * @param meta Block metadata **and** user data.
     * @returns Error?
     */
    public async writeHeadBlock(meta: HeadBlock & CommonWriteMeta): 
        T.XEavSA<'L0_IO_UNKNOWN'|'L0_IO_WRITE_SR'|'L0_IO_WRITE_HEAD'> {
        try {

            const [sError, data] = this.bs.createHeadBlock(meta)
            if (sError) return new IBFSError('L0_IO_WRITE_SR', null, sError, m.ssc(meta, ['data', 'aesKey']))

            const position = this.bs.resolveAddr(meta.address)
            const writeError = await this.write(position, data)
            if (writeError) return new IBFSError('L0_IO_WRITE_HEAD', null, writeError, m.ssc(meta, ['data', 'aesKey']))

        }
        catch (error) {
            return new IBFSError('L0_IO_UNKNOWN', null, error as Error, m.ssc(meta, ['data', 'aesKey']))
        }
    }

    /**
     * Returns a link block after reading it from the disk, deserializing and decrypting it.
     * @param address Block address
     * @param blockSize blocks size (in sectors)
     * @param aesKey decrypt key
     * @param integrity Whether to check for CRC integrity - Only use for recovery.
     * @returns [Error?, Data?]
     */
    public async readLinkBlock(address: number, blockSize: number, aesKey?: Buffer, integrity = true):
        T.XEavA<LinkBlock & CommonReadMeta, 'L0_IO_UNKNOWN'|'L0_IO_READ_LINK'|'L0_IO_READ_DS'|'L0_CRCSUM_MISMATCH'> {
        try {

            const position = this.bs.resolveAddr(address)
            const [linkError, linkBlock] = await this.read(position, this.bs.SECTOR_SIZE * (blockSize+1))
            if (linkError) return IBFSError.eav('L0_IO_READ_LINK', null, linkError, { address, blockSize })
            
            const readResult = this.bs.readLinkBlock(linkBlock, address, aesKey)
            if (readResult.error) return IBFSError.eav('L0_IO_READ_DS', null, readResult.error, { address, blockSize })
            if (readResult.crcMismatch && integrity) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address, blockSize })

            return [null, readResult.meta]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_UNKNOWN', null, error as Error, { address, blockSize })
        }
    }

    /**
     * Serializes a link block and writes it to the disk.
     * 
     * **Important** - The size of usable `data` must be determined in advance and match the `blockSize`.  
     * A mismatch will result in either an error or truncated data being written to the disk which may cause data loss.
     * There must be enough user data to occupy all of the sectors in the block, but not overflow it. The last sector in 
     * the block the does not have to be filled entirely and will be padded if needed.
     * @param meta Block metadata **and** user data.
     * @returns Error?
     */
    public async writeLinkBlock(meta: LinkBlock & CommonWriteMeta): 
        T.XEavSA<'L0_IO_UNKNOWN'|'L0_IO_WRITE_SR'|'L0_IO_WRITE_LINK'> {
        try {

            const [sError, data] = this.bs.createLinkBlock(meta)
            if (sError) return new IBFSError('L0_IO_WRITE_SR', null, sError, m.ssc(meta, ['data', 'aesKey']))

            const position = this.bs.resolveAddr(meta.address)
            const writeError = await this.write(position, data)
            if (writeError) return new IBFSError('L0_IO_WRITE_LINK', null, writeError, m.ssc(meta, ['data', 'aesKey']))
            
        } 
        catch (error) {
            return new IBFSError('L0_IO_UNKNOWN', null, error as Error, m.ssc(meta, ['data', 'aesKey']))
        }
    }

    /**
     * Returns a storage block after reading it from the disk, deserializing and decrypting it.
     * @param address Block address
     * @param blockSize blocks size (in sectors)
     * @param aesKey decrypt key
     * @param integrity Whether to skip CRC integrity checks - Only use for recovery.
     * @returns [Error?, Data?]
     */
    public async readStoreBlock(address: number, blockSize: number, aesKey?: Buffer, integrity = true):
        T.XEavA<StorageBlock & CommonReadMeta, 'L0_IO_UNKNOWN'|'L0_IO_READ_STORAGE'|'L0_IO_READ_DS'|'L0_CRCSUM_MISMATCH'> {
        try {

            const position = this.bs.resolveAddr(address)
            const [storeError, storeBlock] = await this.read(position, this.bs.SECTOR_SIZE * (blockSize+1))
            if (storeError) return IBFSError.eav('L0_IO_READ_STORAGE', null, storeError, { address, blockSize })

            const readResult = this.bs.readStorageBlock(storeBlock, address, aesKey)
            if (readResult.error) return IBFSError.eav('L0_IO_READ_DS', null, readResult.error, { address, blockSize })
            if (readResult.crcMismatch && integrity) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address, blockSize })
                
            return [null, readResult.meta]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_UNKNOWN', null, error as Error, { address, blockSize })
        }
    }


    /**
     * Serializes a storage block and writes it to the disk.
     * 
     * **Important** - The size of usable `data` must be determined in advance and match the `blockSize`.  
     * A mismatch will result in either an error or truncated data being written to the disk which may cause data loss.
     * There must be enough user data to occupy all of the sectors in the block, but not overflow it. The last sector in 
     * the block the does not have to be filled entirely and will be padded if needed.
     * @param meta Block metadata **and** user data.
     * @returns Error?
     */
    public async writeStoreBlock(meta: StorageBlock & CommonWriteMeta): 
        T.XEavSA<'L0_IO_UNKNOWN'|'L0_IO_WRITE_SR'|'L0_IO_WRITE_STORAGE'> {
        try {
            
            const [sError, data] = this.bs.createStorageBlock(meta)
            if (sError) return new IBFSError('L0_IO_WRITE_SR', null, sError, m.ssc(meta, ['data', 'aesKey']))

            const position = this.bs.resolveAddr(meta.address)
            const writeError = await this.write(position, data)
            if (writeError) return new IBFSError('L0_IO_WRITE_STORAGE', null, writeError, m.ssc(meta, ['data', 'aesKey']))

        } 
        catch (error) {
            return new IBFSError('L0_IO_UNKNOWN', null, error as Error, m.ssc(meta, ['data', 'aesKey']))
        }
    }

    // Helpers ================================================================

    /**
     * Takes a filepath and ensures it contains an empty file that
     * can later be opened for writes.
     */
    private static async ensureEmptyFile(file: string): T.EavSA {
        try {
            const filepath = path.dirname(file)
            await fs.mkdir(filepath, { recursive: true })
            const files = await fs.readdir(filepath)
            if (!files.includes(path.basename(file))) await fs.writeFile(file, Buffer.alloc(0))
        }
        catch (error) {
            return error as Error
        }
    }

}
