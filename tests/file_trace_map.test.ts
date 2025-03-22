import * as C from '../src/Constants.js'
import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import Filesystem from '../src/L1/Filesystem.js'

describe('FTM initialization and IO', () => {
    
    const aesKey = Buffer.alloc(16)
    let fs: Filesystem

    beforeAll(async () => {
        console.log(await useEmptyFilesystem({
            filename: 'ftm_io',
            blockSize: 1,
            blockCount: 1000,
            aesCipher: "none",
            aesKey
        }))
        const [fsError, filesystem] = await Filesystem.open(getFilesystemPath('ftm_io'))
        if (fsError) {
            console.log(fsError)
            return expect(fsError).toBeUndefined()
        }
        fs = filesystem
    })

    test('Open a File Trace Map', async () => {

        const [error, ftm] = await fs.openFTM(fs.volume.root.fsRoot, aesKey)
        
        expect(error).toBeNull()
        expect(ftm?.indexBlocks[0].block.length).toBe(1)
        expect(ftm?.indexBlocks[0].block.get(0)).toBe(66)
        expect(ftm?.indexBlocks[0].block.get(1)).toBe(undefined)
        expect(ftm?.indexBlocks[0].block.next).toBe(0)
        
    })


})