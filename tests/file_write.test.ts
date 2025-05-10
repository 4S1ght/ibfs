import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import crypto from 'node:crypto'
import Filesystem from '../src/L1/Filesystem.js'

describe('FTM initialization and IO', () => {
    
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

        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [streamError, stream] = file.createWriteStream({ offset: 10 })
        if (streamError) return expect(streamError).toBeNull()

        stream.write(crypto.randomBytes(1000))
        stream.write(crypto.randomBytes(1000))

        await new Promise(resolve => setTimeout(resolve, 100))
        console.log(stream)

    })


})