// Imports ========================================================================================

import type * as T from '../../types.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { WriteStream } from 'node:fs'

import BlockSerializationContext, { TRootBlock } from './BlockSerialization.js'
import BlockAESContext from './BlockAES.js'
import IBFSError from '../errors/IBFSError.js'
import ssc from '../misc/safeShallowCopy.js'
import { VOLUME_EXT_NAME } from '../Constants.js'
import getPackage from '../misc/package.js'
import { off } from 'node:process'

// Types ==========================================================================================

export interface TVolumeInit {

    /** Physical location of the IBFS volume file. */ fileLocation: string
    /** Physical size of blocks in the volume.     */ blockSize: TRootBlock['blockSize']
    /** Total number of blocks in the volume.      */ blockCount: number
    /** AES cipher used for encryption.            */ aesCipher: TRootBlock['aesCipher']
    /** AES key used for encryption.               */ aesKey: Buffer | string
    
    /** Configures an update handler called every N bytes written to monitor progress. */
    update?: {
        /** Specifies every how many bytes to call an update. */
        frequency?: number
        /** Called whenever an update threshold is reached. */
        onUpdate: (written: number) => any
    }

}

// Exports ========================================================================================

export default class Volume {

    private declare virtualHandle: fs.FileHandle
    private declare bs: BlockSerializationContext
    public  declare rs: TRootBlock

    // Factory ======================================================

    private constructor() {}

    public static async createEmptyVolume(init: TVolumeInit): T.EavSA<IBFSError> {

        let file: fs.FileHandle
        let ws: WriteStream

        try {

            // File bootstrap =======================================

            // Create an empty IBFS file and allocate empty space
            // that will be used by the filesystem.

            const fileMakeError = await Volume.ensureEmptyFile(init.fileLocation)
            if (fileMakeError) return new IBFSError('L0_VC_FAILURE', null, fileMakeError, ssc(init, ['aesKey']))
            
            file = await fs.open(init.fileLocation, 'w+')
            ws = file.createWriteStream({ highWaterMark: init.blockSize * 128 })

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
                return new IBFSError('L0_VC_FAILURE', null, wsError.error, ssc({ ...init, failedAtBlock: wsError.i }, ['aesKey']))
            }

            // Root block ===========================================

            // Set up the serialization contexts and serialize the
            // root lock necessary for mounting the filesystem.

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
                physicalBlockSize
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
            return new IBFSError('L0_VC_FAILURE', null, error as Error, ssc(init, ['aesKey']))
        }
        finally {
            if (ws!) ws.close()
            if (file!) await file.close()
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