// Imports ========================================================================================

import type * as T from '../../types.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { WriteStream } from 'node:fs'

import BlockSerializationContext, { TCommonWriteMeta, TDataBlock, THeadBlock, TLinkBlock, TMetaCluster, TRootBlock } from './BlockSerialization.js'
import BlockAESContext from './BlockAES.js'
import IBFSError from '../errors/IBFSError.js'
import ssc from '../misc/safeShallowCopy.js'
import getPackage from '../misc/package.js'

// Types ==========================================================================================

export interface TVolumeInit {

    /** Physical location of the IBFS volume file. */ fileLocation: string
    /** Physical size of blocks in the volume.     */ blockSize: TRootBlock['blockSize']
    /** Total number of blocks in the volume.      */ blockCount: number
    /** AES cipher used for encryption.            */ aesCipher: TRootBlock['aesCipher']
    /** AES key used for encryption.               */ aesKey: Buffer | string
    
    /** Configures an update handler called every N bytes written to monitor progress. */
    update?: {
        /** Specifies every how many bytes to call an update. @default 5_000_000 */
        frequency?: number
        /** Called whenever an update threshold is reached. */
        onUpdate: (written: number) => any
    }

    init?: {
        /** Size of the high water mark for the write stream. @default 16 */
        highWaterMarkBlocks?: number
    }

}

// Exports ========================================================================================

export default class Volume {

    private declare handle: fs.FileHandle
    private declare bs: BlockSerializationContext
    public  declare rs: TRootBlock

    // Factory ======================================================

    private constructor() {}

    public static async createEmptyVolume(init: TVolumeInit): T.XEavSA<'L0_VI_FAILURE'> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {

            // File bootstrap =======================================

            // Create an empty IBFS file and allocate empty space
            // that will be used by the filesystem.

            const fileMakeError = await Volume.ensureEmptyFile(init.fileLocation)
            if (fileMakeError) return new IBFSError('L0_VI_FAILURE', null, fileMakeError, ssc(init, ['aesKey']))
            
            const highWaterMark = init.init && init.init.highWaterMarkBlocks || 16
            file = await fs.open(init.fileLocation, 'w+')
            ws = file.createWriteStream({ highWaterMark })

            const updateFrequency = init.update && init.update.frequency || 5_000_000 // Bytes
            const emptySpace = Buffer.alloc(BlockSerializationContext.getPhysicalBlockSize(init.blockSize))
            let canWrite = true
            let broken = false
            let bw = 0
            let wsError: { i: number, error: Error }

            for (let i = 0; i < init.blockCount; i++) {

                if (broken) break

                canWrite = ws.write(emptySpace, error => {
                    if (error && !broken) {
                        broken = true
                        wsError = { i, error }
                        ws.close()
                        file.close()
                    }
                })

                if (!canWrite && !broken) await new Promise<void>(resume => {
                    ws.on('drain', () => {
                        ws.removeAllListeners('drain')
                        resume()
                    })
                })

                if (ws.bytesWritten - bw >= updateFrequency) {
                    if (init.update) init.update.onUpdate(ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }
            
            if (wsError!) {
                return new IBFSError('L0_VI_FAILURE', null, wsError.error, ssc({ ...init, failedAtBlock: wsError.i }, ['aesKey']))
            }

            // Root block ===========================================

            // Set up the serialization contexts and serialize the
            // root lock necessary for mounting the filesystem.

            const blockSize = init.blockSize
            const physicalBlockSize = BlockSerializationContext.getPhysicalBlockSize(init.blockSize)
            const metaBlocks = BlockSerializationContext.getMetaBlockCount(init.blockSize)
            const pack = getPackage()

            const aesIV = crypto.randomBytes(16)
            const [aesKeyError, aesKey] = BlockAESContext.deriveAESKey(init.aesCipher, init.aesKey)
            if (aesKeyError) throw aesKeyError

            // Deps setup
            const serialize = new BlockSerializationContext({ 
                cipher: init.aesCipher,
                iv: aesIV,
                blockSize
            })

            // Create key check buffer user later for decryption key verification.
            const aesKeyCheck = (() => {
                if (init.aesCipher === 'none') return Buffer.alloc(16)
                return serialize.aes.encrypt(Buffer.alloc(16), aesKey, 0)
            })()

            const [rootError, rootBlock] = await BlockSerializationContext.serializeRootBlock({
                specMajor: pack.version.major,
                specMinor: pack.version.minor,
                root: metaBlocks + 1,
                compatibility: true,
                blockSize: init.blockSize,
                blockCount: init.blockCount,
                aesCipher: init.aesCipher,
                aesIV,
                aesKeyCheck,
            })
            if (rootError) throw rootError

            await file.write(rootBlock, { position: 0 })

            // Metadata blocks ======================================
            // Write volume metadata

            const [metaError, metaCluster] = BlockSerializationContext.serializeMetaCluster({
                blockSize: init.blockSize,
                metadata: { 
                    ibfs: {
                        originalDriverVersion: pack.versionString
                    } 
                }
            })
            if (metaError) throw metaError

            await file.write(metaCluster, { position: physicalBlockSize })
    

        } 
        catch (error) {
            return new IBFSError('L0_VI_FAILURE', null, error as Error, ssc(init, ['aesKey']))
        }
        finally {
            if (ws!) ws.close()
            if (file!) await file.close()
        }

    }

    public static async open(image: string): T.XEavA<Volume, 'L0_VO_UNKNOWN'|'L0_VO_ROOTFAULT'|'L0_VO_MODE_INCOMPATIBLE'|'L0_VO_SIZE_MISMATCH'> {
        
        const self = new this()

        try {

            self.handle = await fs.open(image, 'r+')

            const rsData = Buffer.allocUnsafe(1024)
            await self.handle.read({ position: 0, length: 1024, buffer: rsData })
            const [rsError, rs] = BlockSerializationContext.deserializeRootBlock(rsData)

            if (rsError)                    return IBFSError.eav('L0_VO_ROOTFAULT', null, rsError, { image })
            if (rs.compatibility === false) return IBFSError.eav('L0_VO_MODE_INCOMPATIBLE', null, null, { image })

            const expectedVolumeSize = rs.blockCount * BlockSerializationContext.getPhysicalBlockSize(rs.blockSize)
            const { size } = await self.handle.stat()

            if (size !== expectedVolumeSize) return IBFSError.eav('L0_VO_SIZE_MISMATCH', null, null, { size, expectedVolumeSize, diff: Math.abs(size - expectedVolumeSize) })
            
            self.bs = new BlockSerializationContext({
                blockSize: rs.blockSize,
                cipher: rs.aesCipher,
                iv: rs.aesIV
            })

            self.rs = rs
            return [null, self]
            
        } 
        catch (error) {
            if (self.handle) await self.handle.close()
            return [new IBFSError('L0_VO_UNKNOWN', null, error as Error, { image }), null]
        }
    }

    // Lifecycle ====================================================

    public async close(): T.XEavSA<"L0_VC_FAILURE"> {
        try {
            await this.handle.close()
        } 
        catch (error) {
            return new IBFSError('L0_VC_FAILURE', null, error as Error)
        }
    }

    // Internal =====================================================

    private async read(position: number, length: number): T.XEavA<Buffer, 'L0_IO_READ_ERROR'> {
        try {
            const buffer = Buffer.allocUnsafe(length)
            await this.handle.read({ position, length, buffer })
            return [null, buffer]
        } 
        catch (error) {
            return [new IBFSError('L0_IO_READ_ERROR', null, error as Error, { position, length }), null]
        }
    }
    
    private async write(position: number, data: Buffer): T.XEavSA<'L0_IO_WRITE_ERROR'> {
        try {
            await this.handle.write(data, 0, data.length, position)
        } 
        catch (error) {
            return new IBFSError('L0_IO_WRITE_ERROR', null, error as Error, { position })
        }
    }

    private async readBlock(address: number): T.XEavA<Buffer, 'L0_IO_READ_ERROR'> {
        try {
            // No need to use slower Buffer.alloc as it will be filled
            // entirely on each read.
            const buffer = Buffer.allocUnsafe(this.bs.BLOCK_SIZE)
            await this.handle.read({ 
                position: this.bs.BLOCK_SIZE * address,
                length: this.bs.BLOCK_SIZE, 
                buffer
            })
            return [null, buffer]
        } 
        catch (error) {
            return [new IBFSError('L0_IO_READ_ERROR', null, error as Error, { address }), null]
        }
    }

    private async writeBlock(address: number, block: Buffer): T.XEavSA<'L0_IO_WRITE_ERROR'> {
        try {
            await this.handle.write(
                /* data */          block, 
                /* data start */    0, 
                /* data length */   block.length, 
                /* File position */ this.bs.BLOCK_SIZE * address
            )
        } 
        catch (error) {
            return new IBFSError('L0_IO_WRITE_ERROR', null, error as Error, { address })
        }
    }

    // Methods ======================================================


    public async readMetaCluster(): T.XEavA<TMetaCluster, 'L0_IO_META_READ_ERROR'|'L0_IO_META_DS_ERROR'> {
        try {
            
            const clusterSize = BlockSerializationContext.getMetaBlockCount(this.rs.blockSize)
            const clusterPosition = 1 * this.bs.BLOCK_SIZE

            const [readError, buffer] = await this.read(clusterPosition, clusterSize)
            if (readError) return [new IBFSError('L0_IO_META_READ_ERROR', null, readError), null]

            const [dsError, cluster] = BlockSerializationContext.deserializeMetaCluster(buffer)
            if (dsError) return [new IBFSError('L0_IO_META_DS_ERROR', null, dsError), null]

            return [null, cluster]

        } 
        catch (error) {
            return [new IBFSError('L0_IO_META_READ_ERROR', null, error as Error), null]
        }
    }

    public async writeRootBlock(): T.XEavSA<'L0_IO_ROOT_WRITE_ERROR'|'L0_IO_ROOT_SR_ERROR'> {
        try {

            const [srError, buffer] = BlockSerializationContext.serializeRootBlock(this.rs)
            if (srError) return new IBFSError('L0_IO_ROOT_SR_ERROR', null, srError)

            const writeError = await this.writeBlock(0, buffer)
            if (writeError) return new IBFSError('L0_IO_ROOT_WRITE_ERROR', null, writeError)
            
        } 
        catch (error) {
            return new IBFSError('L0_IO_ROOT_WRITE_ERROR', null, error as Error)    
        }
    }
    
    public async writeMetaCluster(cluster: TMetaCluster): T.XEavSA<'L0_IO_META_WRITE_ERROR'> {
        try {
            
            const [srError, buffer] = BlockSerializationContext.serializeMetaCluster({
                metadata: cluster.metadata,
                blockSize: this.rs.blockSize
            })
            if (srError) return new IBFSError('L0_IO_META_WRITE_ERROR', null, srError)

            const clusterPosition = 1 * this.bs.BLOCK_SIZE
            const writeError = await this.write(clusterPosition, buffer)
            if (writeError) return new IBFSError('L0_IO_META_WRITE_ERROR', null, writeError)

        } 
        catch (error) {
            return new IBFSError('L0_IO_META_WRITE_ERROR', null, error as Error)
        }
    }

    public async readHeadBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<THeadBlock, 'L0_IO_HEAD_READ_ERROR'|'L0_IO_HEAD_DS_ERROR'|'L0_IO_HEAD_READ_INTEGRITY_ERROR'|'L0_IO_HEAD_READ_UNKNOWN_ERROR'> {
        try {
            
            const position = this.bs.BLOCK_SIZE * address

            const [readError, buffer] = await this.readBlock(position)
            if (readError) return IBFSError.eav('L0_IO_HEAD_READ_ERROR', null, readError, { address, integrity })

            const [dsError, block] = this.bs.deserializeHeadBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_HEAD_DS_ERROR', null, dsError, { address, integrity })

            if (integrity && block.crc32Mismatch)
                return IBFSError.eav('L0_IO_HEAD_READ_INTEGRITY_ERROR', null, null, { address, integrity })

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_HEAD_READ_UNKNOWN_ERROR', null, error as Error, { address, integrity })
        }
    }

    public async writeHeadBlock(block: THeadBlock & TCommonWriteMeta): 
        T.XEavSA<'L0_IO_HEAD_SR_ERROR'|'L0_IO_HEAD_WRITE_ERROR'|'L0_IO_HEAD_WRITE_UNKNOWN_ERROR'> {
        try {

            const [srError, buffer] = this.bs.serializeHeadBlock(block)
            if (srError) return new IBFSError('L0_IO_HEAD_SR_ERROR', null, srError, ssc(block, ['aesKey']))
            
            const position = this.bs.BLOCK_SIZE * block.address
            const writeError = await this.writeBlock(position, buffer)
            if (writeError) return new IBFSError('L0_IO_HEAD_WRITE_ERROR', null, writeError, ssc(block, ['aesKey']))
            
        } 
        catch (error) {
            return new IBFSError('L0_IO_HEAD_WRITE_UNKNOWN_ERROR', null, error as Error, ssc(block, ['aesKey']))
        }
    }

    public async readLinkBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<TLinkBlock, 'L0_IO_LINK_READ_ERROR'|'L0_IO_LINK_DS_ERROR'|'L0_IO_LINK_READ_INTEGRITY_ERROR'|'L0_IO_LINK_READ_UNKNOWN_ERROR'> {
        try {
            
            const position = this.bs.BLOCK_SIZE * address

            const [readError, buffer] = await this.readBlock(position)
            if (readError) return IBFSError.eav('L0_IO_LINK_READ_ERROR', null, readError, { address, integrity })

            const [dsError, block] = this.bs.deserializeLinkBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_LINK_DS_ERROR', null, dsError, { address, integrity })

            if (integrity && block.crc32Mismatch)
                return IBFSError.eav('L0_IO_LINK_READ_INTEGRITY_ERROR', null, null, { address, integrity })

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_LINK_READ_UNKNOWN_ERROR', null, error as Error, { address, integrity })
        }
    }
    
    public async writeLinkBlock(block: TLinkBlock & TCommonWriteMeta): 
        T.XEavSA<'L0_IO_LINK_SR_ERROR'|'L0_IO_LINK_WRITE_ERROR'|'L0_IO_LINK_WRITE_UNKNOWN_ERROR'> {
        try {

            const [srError, buffer] = this.bs.serializeLinkBlock(block)
            if (srError) return new IBFSError('L0_IO_LINK_SR_ERROR', null, srError, ssc(block, ['aesKey']))
            
            const position = this.bs.BLOCK_SIZE * block.address
            const writeError = await this.writeBlock(position, buffer)
            if (writeError) return new IBFSError('L0_IO_LINK_WRITE_ERROR', null, writeError, ssc(block, ['aesKey']))
            
        } 
        catch (error) {
            return new IBFSError('L0_IO_LINK_WRITE_UNKNOWN_ERROR', null, error as Error, ssc(block, ['aesKey']))
        }
        
    }


    public async readDataBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<TDataBlock, 'L0_IO_DATA_READ_ERROR'|'L0_IO_DATA_DS_ERROR'|'L0_IO_DATA_READ_INTEGRITY_ERROR'|'L0_IO_DATA_READ_UNKNOWN_ERROR'> {
        try {

            const position = this.bs.BLOCK_SIZE * address

            const [readError, buffer] = await this.readBlock(position)
            if (readError) return IBFSError.eav('L0_IO_DATA_READ_ERROR', null, readError, { address })

            const [dsError, block] = this.bs.deserializeDataBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_DATA_DS_ERROR', null, dsError, { address })

            if (integrity && block.crc32Mismatch)
                return IBFSError.eav('L0_IO_DATA_READ_INTEGRITY_ERROR', null, null, { address })

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_DATA_READ_UNKNOWN_ERROR', null, error as Error, { address })
        }
        
    }

    public async writeDataBlock(block: TDataBlock & TCommonWriteMeta): 
        T.XEavSA<'L0_IO_DATA_SR_ERROR'|'L0_IO_DATA_WRITE_ERROR'|'L0_IO_DATA_WRITE_UNKNOWN_ERROR'> {
        try {

            const [srError, buffer] = this.bs.serializeDataBlock(block)
            if (srError) return new IBFSError('L0_IO_DATA_SR_ERROR', null, srError, ssc(block, ['aesKey']))
            
            const position = this.bs.BLOCK_SIZE * block.address
            const writeError = await this.writeBlock(position, buffer)
            if (writeError) return new IBFSError('L0_IO_DATA_WRITE_ERROR', null, writeError, ssc(block, ['aesKey']))
            
        } 
        catch (error) {
            return new IBFSError('L0_IO_DATA_WRITE_UNKNOWN_ERROR', null, error as Error, ssc(block, ['aesKey']))
        }
    }

    // Helpers ======================================================

    /** 
     * Ensures a an IBFS file exists in target location before writing to it.  
     * On Linux, creating a `W+` stream to a nonexisting file won't create it but throw an error.
     */
    private static async ensureEmptyFile(file: string): T.EavSA {
        try {
            const filepath = path.dirname(file)
            await fs.mkdir(filepath, { recursive: true })
            const files = await fs.readdir(filepath)
            if (!files.includes(path.basename(file))) await fs.writeFile(file, Buffer.alloc(0), {
                mode: 0o600
            })
        }
        catch (error) {
            return error as Error
        }
    }

}