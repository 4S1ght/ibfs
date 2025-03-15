// Imports =============================================================================================================

import type * as T from '../../types.js'

import fs               from 'node:fs/promises'
import path             from 'node:path'
import crypto           from 'node:crypto'
import { WriteStream }  from 'node:fs'

import BlockSerializationContext, { TCommonReadMeta, TCommonWriteMeta, TDataBlock, TDataBlockReadMeta, THeadBlock, TIndexBlockManage, TLinkBlock, TMetaCluster, TRootBlock } from './BlockSerialization.js'
import BlockAESContext from './BlockAES.js'
import BlockIOQueue, { TTemporaryLock } from './BlockIOQueue.js'
import IBFSError from '../errors/IBFSError.js'
import ssc from '../misc/safeShallowCopy.js'
import getPackage from '../misc/package.js'
import * as C from '../Constants.js'
import retry from '../misc/retry.js'

// Types ===============================================================================================================

export interface TVolumeInit {

    /** Physical location of the IBFS volume file. */ fileLocation: string
    /** Physical size of blocks in the volume.     */ blockSize:    TRootBlock['blockSize']
    /** Total number of blocks in the volume.      */ blockCount:   number
    /** AES cipher used for encryption.            */ aesCipher:    TRootBlock['aesCipher']
    /** AES key used for encryption.               */ aesKey:       Buffer
    
    /** Configures an update handler called every `N` bytes written in order to monitor progress. */
    update?: {
        /** Specifies every how many bytes to call an update. @default 5_000_000 */
        frequency?: number
        /** Called whenever an update threshold is reached. */
        onUpdate: (written: number) => any
    }

    init?: {
        /** Size of the high water mark (in blocks) for the write stream. @default 16 */
        highWaterMarkBlocks?: number
    }

}

type THeadBlockRead = THeadBlock & TIndexBlockManage  & TCommonReadMeta
type TLinkBlockRead = TLinkBlock & TIndexBlockManage  & TCommonReadMeta
type TDataBlockRead = TDataBlock & TDataBlockReadMeta & TCommonReadMeta


// Exports =============================================================================================================

export default class Volume {

    private declare handle: fs.FileHandle
    public  declare bs:     BlockSerializationContext
    private declare queue:  BlockIOQueue
    public  declare root:   TRootBlock

    public declare isOpen:  boolean

    // Lifecycle -------------------------------------------------------------------------------------------------------

    private constructor() {}

    /**
     * Creates a new empty IBFS volume containing just the root block and metadata
     * that are used for further initialization and mounting.
     */
    public static async createEmptyVolume(options: TVolumeInit): T.XEavSA<'L0_VI_FAIL'> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {
         
            // Bootstrap --------------------------------------------------------------------------
            // Create an empty .ibfs file and allocate empty space
            // that will be used by the filesystem.

            const highWaterMark = (options.init && options.init.highWaterMarkBlocks || 16) * options.blockSize
            file = await fs.open(options.fileLocation, 'wx')
            ws = file.createWriteStream({ highWaterMark })

            const updateFrequency = options.update && options.update.frequency || 5_000_000 // Bytes
            const emptySpace = Buffer.alloc(BlockSerializationContext.BLOCK_SIZES[options.blockSize])
            let canWrite = true
            let bw = 0
            let wsError: { i: number, error: Error } | undefined

            for (let i = 0; i < options.blockCount; i++) {

                if (wsError) break

                canWrite = ws.write(emptySpace, error => {
                    if (error && !wsError) {
                        wsError = { i, error }
                        ws.close()
                        file.close()
                    }
                })

                // Pause the loop until the write stream drains
                if (!canWrite && !wsError) await new Promise<void>(resume => {
                    ws.on('drain', () => {
                        ws.removeAllListeners('drain')
                        resume()
                    })
                })

                if (ws.bytesWritten - bw >= updateFrequency) {
                    if (options.update) options.update.onUpdate(ws.bytesWritten)
                    bw = ws.bytesWritten
                }

            }

            if (wsError!) {
                return new IBFSError('L0_VI_FAIL', null, wsError.error, ssc({ ...options, failedAtBlock: wsError.i }, ['aesKey']))
            }

            // Root block -------------------------------------------------------------------------
            // Set up the serialization contexts and create the
            // root block necessary for mounting the filesystem.

            const blockSize = options.blockSize
            const physicalBlockSize = BlockSerializationContext.BLOCK_SIZES[blockSize]
            const pack = getPackage()

            const aesIV = crypto.randomBytes(16)
            const [aesKeyError, aesKey] = BlockAESContext.deriveAESKey(options.aesCipher, options.aesKey)
            if (aesKeyError) throw aesKeyError

            const serialize = new BlockSerializationContext({ 
                cipher: options.aesCipher,
                iv: aesIV,
                blockSize
            })

            const aesKeyCheck = (() => {
                if (options.aesCipher === 'none') return Buffer.alloc(16)
                return serialize.aes.encrypt(Buffer.alloc(16), aesKey, 0)
            })()

            const [rootError, rootBlock] = BlockSerializationContext.serializeRootBlock({
                specMajor: C.SPEC_MAJOR,
                specMinor: C.SPEC_MINOR,
                fsRoot: 0,
                compatibility: true,
                blockSize: options.blockSize,
                blockCount: options.blockCount,
                aesCipher: options.aesCipher,
                aesIV,
                aesKeyCheck,
            })
            if (rootError) throw rootError

            await file.write(rootBlock, { position: 0 })

            // Metadata blocks --------------------------------------------------------------------

            const [metaError, metaCluster] = BlockSerializationContext.serializeMetaCluster({
                blockSize: options.blockSize,
                metadata: { 
                    ibfs: {
                        driverVersion: pack.versionString
                    } 
                }
            })
            if (metaError) throw metaError

            await file.write(metaCluster, { position: physicalBlockSize })

        } 
        catch (error) {
            return new IBFSError('L0_VI_FAIL', null, error as Error, ssc(options, ['aesKey']))
        }
        finally {
            if (ws!) ws.close()
            if (file!) await file.close()
        }
        
    }

    /**
     * Opens the IBFS volume.
     * Does basic integrity checks, sets up the queuing and serialization contexts and opens
     * an internal file handle for managing volume data.
     * @param path absolute to the .ibfs file
     * @param integrity 
     * @returns 
     */
    public static async open(path: string, integrity = true): T.XEavA<Volume, 'L0_VO_CANT_OPEN'|'L0_VO_ROOTFAULT'|'L0_VO_MODE_INCOMPATIBLE'|'L0_VO_SIZE_MISMATCH'> {
        
        const self = new this()

        try {
            
            self.handle = await fs.open(path, 'r+')

            const rsData = Buffer.allocUnsafe(1024)
            await self.handle.read({ position: 0, length: 1024, buffer: rsData })
            const [rootError, root] = BlockSerializationContext.deserializeRootBlock(rsData)

            if (rootError)                    return IBFSError.eav('L0_VO_ROOTFAULT', null, rootError, { path })
            if (root.compatibility === false) return IBFSError.eav('L0_VO_MODE_INCOMPATIBLE', null, null, { path })

            if (integrity) {
                const expectedVolumeSize = root.blockCount * BlockSerializationContext.BLOCK_SIZES[root.blockSize]
                const { size } = await self.handle.stat()
                if (size !== expectedVolumeSize) return IBFSError.eav('L0_VO_SIZE_MISMATCH', null, null, { size, expectedVolumeSize, diff: Math.abs(size - expectedVolumeSize) })
            }

            self.bs = new BlockSerializationContext({
                blockSize: root.blockSize,
                cipher: root.aesCipher,
                iv: root.aesIV
            })

            self.queue = new BlockIOQueue()
            self.isOpen = true
            self.root = root

            return [null, self]

        } 
        catch (error) {
            if (self.handle) await self.handle.close()
            return IBFSError.eav('L0_VO_CANT_OPEN', null, error as Error, { path })
        }
    }

    /**
     * Closes the volume and all the internal handles.  
     * Fails if there is ongoing I/O in order to preserve data integrity.
     * @returns 
     */
    public async close(): T.XEavSA<'L0_VC_FAIL'|'L0_VC_QUEUE_BUSY'> {
        try {
            if (this.queue.busy) return new IBFSError('L0_VC_QUEUE_BUSY', null, null)
            await this.handle.close()
            this.isOpen = false
        } 
        catch (error) {
            return new IBFSError('L0_VC_FAIL', null, error as Error)
        }
    }

    // Internal methods ------------------------------------------------------------------------------------------------

    public async read(position: number, length: number): T.XEavA<Buffer, 'L0_IO_READ'|'L0_IO_TIMED_OUT'> {
        let lock: TTemporaryLock
        try {
            lock = await this.queue.acquireTemporaryLock()
            const buffer = Buffer.allocUnsafe(length)
            await retry<any>(() => !lock.stale && this.handle.read({ position, length, buffer }))
            const releaseError = lock.release()
            return releaseError ? [releaseError, null] : [null, buffer]
        } 
        catch (error) {
            if (lock!.stale == false) lock!.release()
            return IBFSError.eav('L0_IO_READ', null, error as Error, { position, length })
        }
    }

    public async write(position: number, data: Buffer): T.XEavSA<'L0_IO_WRITE'|'L0_IO_TIMED_OUT'> {
        let lock: TTemporaryLock
        try {
            lock = await this.queue.acquireTemporaryLock()
            await retry<any>(() => !lock.stale && this.handle.write(data, 0, data.length, position))
            return lock.release()
        } 
        catch (error) {
            if (lock!.stale == false) lock!.release()
            return new IBFSError('L0_IO_WRITE', null, error as Error, { position })
        }
    }

    public async readBlock(address: number): T.XEavA<Buffer, 'L0_IO_BLOCK_READ'|'L0_IO_TIMED_OUT'> {
        let lock: TTemporaryLock
        try {
            lock = await this.queue.acquireTemporaryLock()
            const buffer = Buffer.allocUnsafe(this.bs.BLOCK_SIZE)
            await retry<any>(() => !lock.stale && this.handle.read({
                position: this.bs.BLOCK_SIZE * address,
                length: this.bs.BLOCK_SIZE,
                buffer
            }))
            const releaseError = lock.release()
            return releaseError ? [releaseError, null] : [null, buffer]
        } 
        catch (error) {
            if (lock!.stale == false) lock!.release()
            return IBFSError.eav('L0_IO_BLOCK_READ', null, error as Error, { address })
        }
    }

    public async writeBlock(address: number, block: Buffer): T.XEavSA<'L0_IO_BLOCK_WRITE'|'L0_IO_TIMED_OUT'> {
        let lock: TTemporaryLock
        try {
            lock = await this.queue.acquireTemporaryLock()
            await retry<any>(() => !lock.stale && this.handle.write(
                /* data */          block, 
                /* data start */    0, 
                /* data length */   block.length, 
                /* File position */ this.bs.BLOCK_SIZE * address
            ))
            return lock.release()
        } 
        catch (error) {
            if (lock!.stale == false) lock!.release()
            return new IBFSError('L0_IO_BLOCK_WRITE', null, error as Error, { address })
        }
    }

    // API methods -----------------------------------------------------------------------------------------------------

    public async overwriteRootBlock(): T.XEavSA<'L0_IO_ROOT_OVERWRITE'> {
        try {
            
            const [srError, buffer] = BlockSerializationContext.serializeRootBlock(this.root)
            if (srError) return new IBFSError('L0_IO_ROOT_OVERWRITE', null, srError)

            const writeError = await this.writeBlock(0, buffer)
            if (writeError) return new IBFSError('L0_IO_ROOT_OVERWRITE', null, writeError)

        } 
        catch (error) {
            return new IBFSError('L0_IO_ROOT_OVERWRITE', null, error as Error)
        }
    }

    public async readMetaBlocks(): T.XEavA<TMetaCluster['metadata'], 'L0_IO_META_READ'> {
        try {

            const clusterSize = this.bs.BLOCK_SIZE * Math.ceil(C.KB_64 / this.bs.BLOCK_SIZE)
            const clusterPosition = 1 * this.bs.BLOCK_SIZE

            const [readError, buffer] = await this.read(clusterPosition, clusterSize)
            if (readError) return IBFSError.eav('L0_IO_META_READ', null, readError)

            const [dsError, cluster] = BlockSerializationContext.deserializeMetaCluster(buffer)
            if (dsError) return IBFSError.eav('L0_IO_META_READ', null, dsError)

            return [null, cluster]
            
        } 
        catch (error) {
            return IBFSError.eav('L0_IO_META_READ', null, error as Error)    
        }
    }

    public async writeMetaBlocks(cluster: TMetaCluster): T.XEavSA<'L0_IO_META_WRITE'> {
        try {
        
            const [srError, buffer] = BlockSerializationContext.serializeMetaCluster({
                metadata: cluster.metadata,
                blockSize: this.root.blockSize
            })
            if (srError) return new IBFSError('L0_IO_META_WRITE', null, srError)

            const clusterPosition = 1 * this.bs.BLOCK_SIZE
            const writeError = await this.write(clusterPosition, buffer)
            if (writeError) return new IBFSError('L0_IO_META_WRITE', null, writeError)

        } 
        catch (error) {
            return new IBFSError('L0_IO_META_WRITE', null, error as Error)
        }
    }

    public async readHeadBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<THeadBlockRead, 'L0_IO_HEADBLOCK_READ'|'L0_IO_HEADBLOCK_READ_INTEGRITY'> {
        try {
                
            const [readError, buffer] = await this.readBlock(address)
            if (readError) return IBFSError.eav('L0_IO_HEADBLOCK_READ', null, readError, { address })

            const [dsError, block] = this.bs.deserializeHeadBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_HEADBLOCK_READ', null, dsError, { address })

            if (integrity && (block.crc32Mismatch || block.blockType !== 'HEAD'))
                return IBFSError.eav('L0_IO_HEADBLOCK_READ_INTEGRITY', null, null, { address })

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_HEADBLOCK_READ', null, error as Error, { address })    
        }
    }

    public async writeHeadBlock(block: THeadBlock & TCommonWriteMeta): T.XEavSA<'L0_IO_HEADBLOCK_WRITE'> {
        try {

            const [srError, buffer] = this.bs.serializeHeadBlock(block)
            if (srError) return new IBFSError('L0_IO_HEADBLOCK_WRITE', null, srError, ssc(block, ['aesKey']))

            const writeError = await this.writeBlock(block.address, buffer)
            if (writeError) return new IBFSError('L0_IO_HEADBLOCK_WRITE', null, writeError, ssc(block, ['aesKey']))
            
        }
         catch (error) {
            return new IBFSError('L0_IO_HEADBLOCK_WRITE', null, error as Error)
        }
    }

    public async readLinkBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<TLinkBlockRead, 'L0_IO_LINKBLOCK_READ'|'L0_IO_LINKBLOCK_READ_INTEGRITY'> {
        try {
            
            const [readError, buffer] = await this.readBlock(address)
            if (readError) return IBFSError.eav('L0_IO_LINKBLOCK_READ', null, readError, { address })

            const [dsError, block] = this.bs.deserializeLinkBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_LINKBLOCK_READ', null, dsError, { address })

            if (integrity && (block.crc32Mismatch || block.blockType !== 'LINK'))
                return IBFSError.eav('L0_IO_LINKBLOCK_READ_INTEGRITY', null, null, { address })

            return [null, block]

        } 
        catch (error) {
            return IBFSError.eav('L0_IO_LINKBLOCK_READ', null, error as Error, { address })    
        }
    }

    public async writeLinkBlock(block: TLinkBlock & TCommonWriteMeta): T.XEavSA<'L0_IO_LINKBLOCK_WRITE'> {
        try {
            
            const [srError, buffer] = this.bs.serializeLinkBlock(block)
            if (srError) return new IBFSError('L0_IO_LINKBLOCK_WRITE', null, srError, ssc(block, ['aesKey']))

            const writeError = await this.writeBlock(block.address, buffer)
            if (writeError) return new IBFSError('L0_IO_LINKBLOCK_WRITE', null, writeError, ssc(block, ['aesKey']))
                
        } 
        catch (error) {
            return new IBFSError('L0_IO_LINKBLOCK_WRITE', null, error as Error)
        }
    }

    public async readDataBlock(address: number, aesKey: Buffer, integrity = true): 
        T.XEavA<TDataBlockRead, 'L0_IO_DATABLOCK_READ'|'L0_IO_DATABLOCK_READ_INTEGRITY'> {
        try {
            
            const [readError, buffer] = await this.readBlock(address)
            if (readError) return IBFSError.eav('L0_IO_DATABLOCK_READ', null, readError, { address })

            const [dsError, block] = this.bs.deserializeDataBlock(buffer, address, aesKey)
            if (dsError) return IBFSError.eav('L0_IO_DATABLOCK_READ', null, dsError, { address })

            if (integrity && (block.crc32Mismatch || block.blockType !== 'DATA'))
                return IBFSError.eav('L0_IO_DATABLOCK_READ_INTEGRITY', null, null, { address })

            return [null, block]

        }
         catch (error) {
            return IBFSError.eav('L0_IO_DATABLOCK_READ', null, error as Error, { address })    
        }
    }

    public async writeDataBlock(block: TDataBlock & TCommonWriteMeta): T.XEavSA<'L0_IO_DATABLOCK_WRITE'> {
        try {
            
            const [srError, buffer] = this.bs.serializeDataBlock(block)
            if (srError) return new IBFSError('L0_IO_DATABLOCK_WRITE', null, srError, ssc(block, ['aesKey']))

            const writeError = await this.writeBlock(block.address, buffer)
            if (writeError) return new IBFSError('L0_IO_DATABLOCK_WRITE', null, writeError, ssc(block, ['aesKey']))
                
        } 
        catch (error) {
            return new IBFSError('L0_IO_DATABLOCK_WRITE', null, error as Error)
        }
    }


}