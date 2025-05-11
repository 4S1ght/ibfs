import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import crypto from 'node:crypto'
import Filesystem from '../src/L1/Filesystem.js'
import fsp from 'fs/promises'
import path from 'path'
const dirname = await fsp.realpath(process.cwd())

describe('FTM initialization and IO', async () => {
    

    const aesKey = Buffer.alloc(16)
    let fs: Filesystem

    beforeAll(async () => {
        await useEmptyFilesystem({
            filename: 'file_write',
            blockSize: 1,
            blockCount: 1000,
            aesCipher: "none",
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

        const text = await fsp.open(path.join(dirname, './tests/misc/long-text.txt'), 'r')
        
        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [streamError, stream] = file.createWriteStream({ offset: 5 })
        if (streamError) return expect(streamError).toBeNull()

        const rs = text.createReadStream({ highWaterMark: 2048 })
        rs.pipe(stream)
        
        await new Promise<void>(resolve => stream.on('finish', () => resolve()))

    })

    test(`Stream to a file with offset equal to first block's length`, async () => {

    })


})