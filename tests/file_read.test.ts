import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import Filesystem from '../src/L1/Filesystem.js'

describe('FTM initialization and IO', () => {
    
    const aesKey = Buffer.alloc(16)
    let fs: Filesystem

    beforeAll(async () => {
        await useEmptyFilesystem({
            filename: 'file_read',
            blockSize: 1,
            blockCount: 1000,
            aesCipher: "none",
            aesKey
        })
        const [fsError, filesystem] = await Filesystem.open(getFilesystemPath('file_read'), aesKey)
        if (fsError) {
            console.log(fsError)
            return expect(fsError).toBeUndefined()
        }
        fs = filesystem
    })

    test(`Test file's FBM`, async () => {

        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        expect(file.fbm.items[0]!.block.length).toBe(1)
        expect(file.fbm.items[0]!.block.get(0)).toBe(66)
        expect(file.fbm.items[0]!.block.get(1)).toBe(undefined)
        expect(file.fbm.items[0]!.block.next).toBe(0)

    })

    test('Open file and read its data (root directory)', async () => {

        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [readError, data] = await file.readFile()
        if (readError) return expect(readError).toBeNull()

        // 2B dir fields, 2B user perms, 1B metadata fields (5 bytes total)
        expect(data).toStrictEqual(Buffer.from([0x0, 0x0, 0x0, 0x0, 0x0]))

    })

    test('Open file and stream its data (root directory)', async () => {

        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [streamError, stream] = file.createReadStream({ maxChunkSize: 2 })
        if (streamError) return expect(streamError).toBeNull()

        let data = Buffer.alloc(0)
        let chunks = 0

        for await (const chunk of stream) {
            chunks++
            data = Buffer.concat([data, chunk])
        }

        expect(data).toStrictEqual(Buffer.from([0x0, 0x0, 0x0, 0x0, 0x0]))
        console.log(file)

    })

})
