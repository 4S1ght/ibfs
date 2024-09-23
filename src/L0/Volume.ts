// Imports ========================================================================================

/// <reference path="../types.d.ts"/>

import path                                     from "node:path"
import fs                                       from "node:fs/promises"
import crypto                                   from "node:crypto"
import type { WriteStream }                     from "node:fs"

import Serialize, { RootSector, SectorSize }    from "@L0/Serialize.js"
import AES, { AESCipher }                       from "@L0/AES.js"
import Memory                                   from "@L0/Memory.js"
import IBFSError                                from "@errors"
import * as m                                   from "@misc"
import * as C                                   from "@constants"

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

    private mLock = new m.Lock(5000)

    private constructor() {}

    // Factory ================================================================

    /**
     * Creates an empty volume in a specified location.
     * @param init Initial volume information.
     * @returns Error (if ocurred)
     */
    public static async create(init: VolumeCreateInit): EavSingleAsync<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {
            
            const update     = init.update ? init.update.callback : (() => {})
            const updateFreq = init.update ? init.update.frequency || 5_000_000 : 5_000_000

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
            const metadataSectors = Math.ceil(1024*1024 / init.sectorSize)
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
                aesKey
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
                if (ws.bytesWritten - bw >= updateFreq) {
                    update('write', ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

            if (wsError!) {
                return new IBFSError(
                    'L0_VCREATE_WS_ERROR', 
                    'WriteStream error while creating the volume.', 
                    wsError.error, 
                    m.ssc({ ...init, failedAtSector: wsError.i }, ['aesKey'])
                )
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
    public static async open(image: string): EavAsync<Volume, IBFSError> {

        const self = new this()

        try {

            self.handle = await fs.open(image, 'r+')

            const rsData = Buffer.alloc(1024)
            await self.handle.read({ offset: 0, length: 1024, buffer: rsData })
            const [rsError, rs] = Serialize.readRootSector(rsData)

            if (rsError) return IBFSError.eav(
                'L0_VOPEN_ROOT_DESERIALIZE',
                'Failed to deserialize the root sector needed for further initialization.',
                rsError, { image }
            )
            if (rs.cryptoCompatMode === false) return IBFSError.eav(
                'L0_VOPEN_MODE_INCOMPATIBLE',
                'The IBFS image was created without compatibility for NodeJS crypto APIs and is impossible to be decrypted by this driver.',
                null, { image }
            )

            // Expected size     Root sector     Metadata block                                     User data
            const expectedSize = rs.sectorSize + rs.sectorSize*Math.ceil(1024*1024/rs.sectorSize) + rs.sectorSize*rs.sectorCount
            const { size } = await self.handle.stat()

            if (size !== expectedSize) return IBFSError.eav(
                'L0_VOPEN_SIZE_MISMATCH',
                `Volume file size differs from size expected size calculated using volume metadata.`,
                null, { size, expectedSize, diff: Math.abs(size - expectedSize) }
            )

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
            return [new IBFSError('L0_VOPEN_CANT_OPEN', `Can't initialize the volume.`, error as Error, { image }), null] 
        }
    }

    // Misc ===================================================================

    private async read(position: number, length: number): EavAsync<Buffer> {
        try {
            const buffer = Buffer.allocUnsafe(length)
            const result = await this.handle.read({ position, length, buffer })
            return [null, result.buffer]
        } 
        catch (error) {
            return IBFSError.eav('L0_IO_READ', null, error as Error, { position, length })
        }
    }

    private async write(position: number, data: Buffer): EavSingleAsync<IBFSError> {
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
    public async readMetaBlock<Meta extends Object = Object>(): EavAsync<Meta, IBFSError> {

        const lock = this.mLock.acquire()
        if (!lock) return IBFSError.eav('L0_IO_RESOURCE_BUSY', 'Meta block occupied or lock-stale.')

        try {
            const address = this.bs.resolveAddr(1)
            const [readError, metaBlock] = await this.read(address, this.bs.META_SIZE)
            if (readError) return IBFSError.eav('L0_IO_READ_META', 'Could not read meta block.', readError)

            const [dsError, data] = this.bs.readMetaBlock<Meta>(metaBlock)
            if (dsError) return IBFSError.eav('L0_IO_READ_DS', 'Data was read but could not be deserialized.', dsError)
            
            return [null, data]
        }
        catch (error) {
            return IBFSError.eav('L0_IO_UNKNOWN', null, error as Error)
        }
        finally {
            lock.release()
        }
    }

    public async writeMeatBlock(meta: Object): EavSingleAsync<IBFSError> {

        const lock = this.mLock.acquire()
        if (!lock) return new IBFSError('L0_IO_RESOURCE_BUSY', 'Meta block occupied or lock-stale.')

        try {
            const [sError, data] = this.bs.createMetaBlock(meta)
            if (sError) return new IBFSError('L0_IO_WRITE_SR', 'Could not serialize meta block before write.', sError)

            const address = this.bs.resolveAddr(1)
            const writeError = await this.write(address, data)
            if (writeError) return new IBFSError('L0_WRITE_META', 'Could not write meta block.', writeError)
        }
        catch (error) {
            return new IBFSError('L0_IO_UNKNOWN', null, error as Error)
        }
        finally {
            lock.release()
        }
        
    }

    public async readHeadBlock() {}
    public async writeHeadBlock() {}

    public async readLinkBlock() {}
    public async writeLinkBlock() {}

    public async readStoreBlock() {}
    public async writeStoreBlock() {}

}
