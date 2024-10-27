// TODOs
// - Add block type checks (check block type int8 on block reads) to prevent misreads & corruption.
//
// Imports ========================================================================================

import * as T from "@types"

import path                 from "node:path"
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

export interface VolumeCreateInit extends VolumeMetadata {
    /** The location of the virtual disk file. */
    file: string
    /** Size of individual sectors inside the virtual disk file. */
    sectorSize: SectorSize
    /** Number of usable data sectors inside the virtual disk file (does not include volume metadata). */
    sectorCount: number
    /** AES cipher used. Leave empty for no encryption. */
    aesCipher: keyof typeof AESCipher
    /** AES encryption key used. */
    aesKey?: Buffer | string
    /** Progress update configuration. */
    update?: {
        /** 
         * Specifies every how many bytes written to the disk to call an update callback. 
         * @default 5_000_000
         */
        frequency?: number
        /** A callback called on each update as the volume is being created. */
        callback: (status: VolumeCreateStatus, written: number) => any
    },
}

interface VolumeMetadata {
    /** IBFS driver configuration. */
    driver?: {
        /** 
         * Specifies the size of individual chunks the free sector address pool is split into. 
         * These pools are loaded into memory individually, while the rest is stored on the disk 
         * next to the IBFS volume, similarly to SWAP memory. This helps preserve system memory
         * when large volumes are open.
         * @default 32768 // (8 bytes per address X 32768 = 256kiB memory used)
         */
        memoryPoolSwapSize?: number
        /** 
         * Specifies the number of addresses left from draining or filling a pool chunk that must 
         * be reached before another pool chunk is preloaded into memory.
         * @default 1024
         */
        memoryPoolPreloadThreshold?: number
        /** 
         * Specifies the number of addresses left from draining or filling a pool chunk that must 
         * be reached before a standby preloaded chunk is unloaded.
         * This value **must** be higher than that of `memoryPoolPreloadThreshold`.
         * @default 2048
         */
        memoryPoolUnloadThreshold?: number
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

    private constructor() {}

    // Factory ================================================================

    /**
     * Creates an empty volume in a specified location.
     * @param init Initial volume information.
     * @returns Error (if ocurred)
     */
    public static async create(init: VolumeCreateInit): T.EavSA<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {
            
            const update          = init.update ? init.update.callback : (() => {})
            const updateFrequency = init.update ? init.update.frequency || 5_000_000 : 5_000_000

            // Setup ================================================
            
            update('setup', 0)

            // Ensure file EXT
            if (path.extname(init.file) !== C.VD_FILE_EXT) init.file != C.VD_FILE_EXT

            const aesIV = crypto.randomBytes(16)
            const [aesKeyError, aesKey] = AES.deriveAESKey(init.aesCipher, init.aesKey)
            if (aesKeyError) return aesKeyError

            // deps setup
            const serialize = new Serialize({ 
                diskSectorSize: init.sectorSize,
                cipher: init.aesCipher,
                iv: aesIV
            })

            // Root sector ==========================================
            
            update('bootstrap', 0)

            // Deps
            const metadataSectors = Math.ceil(1024*128 / init.sectorSize)
            const rootDirHeadAddress = metadataSectors + 1
            const rootDirStoreAddress = metadataSectors + 2

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
                metadataSectors:        metadataSectors,
                aesCipher:              AESCipher[init.aesCipher || ''],
                aesIV:                  aesIV,
                cryptoCompatMode:       true,
                aesKeyCheck:            aesKeyCheck,
                rootDirectory:          rootDirHeadAddress
            })           
            if (rootError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, rootError, m.ssc(init, ['aesKey']))

            // Metadata block =======================================

            const metadata = {
                memoryPoolSwapSize:         init.driver ? (init.driver.memoryPoolSwapSize         || 32768) : 32768,
                memoryPoolPreloadThreshold: init.driver ? (init.driver.memoryPoolPreloadThreshold || 1024)  : 1024,
                memoryPoolUnloadThreshold:  init.driver ? (init.driver.memoryPoolUnloadThreshold  || 2048)  : 2048
            }

            if (metadata.memoryPoolPreloadThreshold >= metadata.memoryPoolUnloadThreshold)
                return new IBFSError(
                    'L0_VCREATE_DRIVER_MISCONFIG', 
                    `Memory pool preload threshold must greater than the unload threshold.`, 
                    null, m.ssc(init, ['aesKey'])
                )

            const [metaError, metaBlock] = serialize.createMetaBlock({ ibfs: metadata })
            if (metaError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, metaError, m.ssc(init, ['aesKey']))

            // Root directory head block ============================

            const rootDirHeadData = Memory.alloc(serialize.HEAD_CONTENT)
            // Address of the first root directory storage block and its block size
            rootDirHeadData.writeInt64(rootDirStoreAddress)
            rootDirHeadData.writeInt8(0)

            const [dirHeadError, dirHead] = serialize.createHeadBlock({
                created: Date.now()/1000,
                modified: Date.now()/1000,
                data: rootDirHeadData.buffer,
                next: 0,
                nextSize: 0,
                blockSize: 0,
                address: rootDirHeadAddress,
                aesKey,
                resourceType: 0
            })
            if (dirHeadError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, dirHeadError, m.ssc(init, ['aesKey']))


            // Root directory content block =========================
    
            const [dirStoreError, dirStore] = serialize.createStorageBlock({
                data: Buffer.from(JSON.stringify({})),
                blockSize: 0,
                address: rootDirStoreAddress,
                aesKey
            })            
            if (dirStoreError) return new IBFSError('L0_VCREATE_CANT_CREATE', null, dirStoreError, m.ssc(init, ['aesKey']))


            // File write ===========================================
            update('write', 0)

            file = await fs.open(init.file, 'w+', 0o600)
            ws = file.createWriteStream({ highWaterMark: init.sectorSize * 128 })

            const bf = Buffer.alloc(init.sectorSize)
            let canWrite = true
            let broken = false
            let wsError: { i: number, error: Error }
            let bw = 0

            const { bytesWritten: bwBootstrapped } = await file.write(Buffer.concat([
                rootSector,
                metaBlock,
                dirHead,
                dirStore
            ]))

            for (let i = 2; i < init.sectorCount; i++) {

                if (broken) break

                canWrite = ws.write(bf, error => {
                    if (error && !broken) {
                        broken = true
                        wsError = { i, error }
                        ws.close()
                        file.close()
                    }
                })

                // Pause the loop if the stream fills up
                if (!canWrite) await new Promise<void>(resume => ws.on('drain', () => {
                    ws.removeAllListeners('drain')
                    resume()
                }))

                // Report amount of bytes written.
                if (ws.bytesWritten - bw >= updateFrequency) {
                    update('write', ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

            if (wsError!) {
                return new IBFSError('L0_VCREATE_WS_ERROR', null, wsError.error, m.ssc({ ...init, failedAtSector: wsError.i }, ['aesKey']))
            }

            update('done', ws.bytesWritten + bwBootstrapped)

        } 
        catch (error) {
            return new IBFSError('L0_VCREATE_CANT_CREATE', null, error as Error, m.ssc(init, ['aesKey']))
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

            // Expected size     Root sector     Metadata block                                     User data
            const expectedSize = rs.sectorSize + rs.sectorSize*Math.ceil(1024*128/rs.sectorSize) + rs.sectorSize*rs.sectorCount
            const { size } = await self.handle.stat()

            if (size !== expectedSize) return IBFSError.eav('L0_VOPEN_SIZE_MISMATCH', null, null, { size, expectedSize, diff: Math.abs(size - expectedSize) })

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
     * 
     * **Important** - The size of usable `data` must be determined in advance and match the `blockSize`.  
     * A mismatch will result in either an error or truncated data being written to the disk which may cause data loss.
     * There must be enough user data to occupy all of the sectors in the block, but not overflow it. The last sector in 
     * the does not have to be filled entirely and will be padded if needed.
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
     * @returns [Error?, Data?]
     */
    public async readHeadBlock(address: number, aesKey?: Buffer):
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

            if ((head.meta as Meta).crcMismatch) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address })
        
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
     * the does not have to be filled entirely and will be padded if needed.
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
     * @returns [Error?, Data?]
     */
    public async readLinkBlock(address: number, blockSize: number, aesKey?: Buffer):
        T.XEavA<LinkBlock & CommonReadMeta, 'L0_IO_UNKNOWN'|'L0_IO_READ_LINK'|'L0_IO_READ_DS'|'L0_CRCSUM_MISMATCH'> {
        try {

            const position = this.bs.resolveAddr(address)
            const [linkError, linkBlock] = await this.read(position, this.bs.SECTOR_SIZE * (blockSize+1))
            if (linkError) return IBFSError.eav('L0_IO_READ_LINK', null, linkError, { address, blockSize })
            
            const readResult = this.bs.readLinkBlock(linkBlock, address, aesKey)
            if (readResult.error) return IBFSError.eav('L0_IO_READ_DS', null, readResult.error, { address, blockSize })
            if (readResult.crcMismatch) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address, blockSize })

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
     * the does not have to be filled entirely and will be padded if needed.
     * ```
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
     * @returns [Error?, Data?]
     */
    public async readStoreBlock(address: number, blockSize: number, aesKey?: Buffer):
        T.XEavA<StorageBlock & CommonReadMeta, 'L0_IO_UNKNOWN'|'L0_IO_READ_STORAGE'|'L0_IO_READ_DS'|'L0_CRCSUM_MISMATCH'> {
        try {

            const position = this.bs.resolveAddr(address)
            const [storeError, storeBlock] = await this.read(position, this.bs.SECTOR_SIZE * (blockSize+1))
            if (storeError) return IBFSError.eav('L0_IO_READ_STORAGE', null, storeError, { address, blockSize })

            const readResult = this.bs.readStorageBlock(storeBlock, address, aesKey)
            if (readResult.error) return IBFSError.eav('L0_IO_READ_DS', null, readResult.error, { address, blockSize })
            if (readResult.crcMismatch) return IBFSError.eav('L0_CRCSUM_MISMATCH', null, null, { address, blockSize })
                
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
     * the does not have to be filled entirely and will be padded if needed.
     * ```
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

}
