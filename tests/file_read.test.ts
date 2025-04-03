import * as C from '../src/Constants.js'
import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import Filesystem from '../src/L1/Filesystem.js'

describe('FTM initialization and IO', () => {
    
    const aesKey = Buffer.alloc(16)
    let fs: Filesystem

    beforeAll(async () => {
        console.log(await useEmptyFilesystem({
            filename: 'file_read',
            blockSize: 1,
            blockCount: 1000,
            aesCipher: "none",
            aesKey
        }))
        const [fsError, filesystem] = await Filesystem.open(getFilesystemPath('ftm_io'), aesKey)
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

    test('Open file and read its data', async () => {

        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [readError, data] = await file.readFull()
        if (readError) return expect(readError).toBeNull()

        console.log('-------------')
        console.log(data.toString())
        console.log('-------------')

    })

})