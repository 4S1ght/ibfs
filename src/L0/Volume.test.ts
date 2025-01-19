import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import url from 'url'

const dirname = path.dirname(url.fileURLToPath(import.meta.url))

import { describe, expect, test } from "vitest"
import Volume from "./Volume"

const key = 'hello world'
const alg = 'aes-256-xts'
const testDir = path.join(dirname, '../../tests')
const volumeFile = path.join(testDir, 'volume.ibfs')

const volumeStat = () => fs.statSync(volumeFile)
const clear = async () => Promise.all((await fsp.readdir(testDir)).map(file => fsp.rm(path.join(testDir, file))))

describe('Volume initialization & mounting', async () => {

    await clear()

    const volumeCreateError = await Volume.createEmptyVolume({
        fileLocation: volumeFile,
        blockSize: 1,
        blockCount: 1000,
        aesCipher: alg,
        aesKey: key
    })
    const stats = volumeStat()

    test('create error', () => expect(volumeCreateError).toBe(undefined))
    test('stat',         () => expect(stats.isFile())   .toBe(true))

    const [openError, volume] = await Volume.open(volumeFile)
    if (openError) {
        console.error(openError)
        throw openError
    }

    test('volume.rs.blockSize',  () => expect(volume.rs.blockSize)    .toBe(1))
    test('volume.rs.blockCount', () => expect(volume.rs.blockCount)   .toBe(1000))
    test('volume.compatibility', () => expect(volume.rs.compatibility).toBe(true))
    test('volume.aesCipher',     () => expect(volume.rs.aesCipher)    .toBe(alg))

    

})