import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import crypto from 'node:crypto'
import Filesystem from '../src/L1/Filesystem.js'
import fsp from 'fs/promises'
import path from 'path'
import { KB_4, MB_1 } from "../src/Constants.js"
import BlockAESContext from "../src/L0/BlockAES.js"
const dirname = await fsp.realpath(process.cwd())

describe('FTM initialization and IO', async () => {
    
    Buffer.poolSize = MB_1

    const [aesKeyError, aesKey] = BlockAESContext.deriveAESKey('aes-256-xts', 'hello world')
    if (aesKeyError) return expect(aesKeyError).toBeUndefined()

    let fs: Filesystem

    beforeAll(async () => {
        await useEmptyFilesystem({
            filename: 'file_write',
            blockSize: 3,
            blockCount: 1_000,
            aesCipher: "aes-256-xts",
            aesKey
        })
        const [fsError, filesystem] = await Filesystem.open(getFilesystemPath('file_write'), aesKey)
        if (fsError) {
            console.log(fsError)
            return expect(fsError).toBeUndefined()
        }
        fs = filesystem
    })

    test('Open file and stream into it (root directory)', async () => {
        
        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [streamError, stream] = file.createWriteStream({ offset: 5 })
        if (streamError) return expect(streamError).toBeNull()

        const writeData = crypto.randomBytes(KB_4 * 900)
        stream.write(writeData)
        stream.end()
        await new Promise<void>(resolve => stream.on('finish', () => resolve()))

    }, 30_000)

    test(`Stream to a file with offset equal to first block's length`, async () => {

    })


})