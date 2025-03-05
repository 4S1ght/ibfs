// Imports =============================================================================================================

import type * as T from '../../types.js'

import fs               from 'node:fs/promises'
import path             from 'node:path'
import crypto           from 'node:crypto'
import { WriteStream }  from 'node:fs'

import BlockSerializationContext, { TRootBlock } from './BlockSerialization.js'
import BlockAESContext from './BlockAES.js'
import BlockIOQueue from './BlockIOQueue.js'
import IBFSError from '../errors/IBFSError.js'
import ssc from '../misc/safeShallowCopy.js'
import getPackage from '../misc/package.js'
import * as C from '../Constants.js'

// Types ===============================================================================================================


export interface TVolumeInit {

    /** Physical location of the IBFS volume file. */ fileLocation: string
    /** Physical size of blocks in the volume.     */ blockSize:    TRootBlock['blockSize']
    /** Total number of blocks in the volume.      */ blockCount:   number
    /** AES cipher used for encryption.            */ aesCipher:    TRootBlock['aesCipher']
    /** AES key used for encryption.               */ aesKey:       Buffer
    
    /** Configures an update handler called every N bytes written to monitor progress. */
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

// Exports =============================================================================================================

export default class Volume {

    private declare handle: fs.FileHandle
    public  declare bs:     BlockSerializationContext
    private declare queue:  BlockIOQueue
    public  declare root:   TRootBlock

    public declare isOpen:  boolean

    // Factory ------------------------------------------------------------------------------------

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
            file = await fs.open(options.fileLocation, 'r+')
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
                root: 0,
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

}