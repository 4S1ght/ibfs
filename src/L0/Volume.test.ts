
import { describe, test, expect } from 'vitest'
import Volume from './Volume.js'
import path from 'node:path'
import url from 'node:url'

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

describe('Create/open volume', async () => { 

    const createError = await Volume.create({
        file: path.join(dirname, '../../tests/Volume.ibfs'),
        sectorSize: 1024,
        sectorCount: 1000,
        aesCipher: 'aes-256-xts',
        aesKey: 'Top secret!',
        driver: {
            memoryPoolPreloadThreshold: 1024,
            memoryPoolUnloadThreshold: 1025,
        }
    })
    if (createError) throw createError

    const [volumeError, volume] = await Volume.open(path.join(dirname, '../../tests/Volume.ibfs'))
    if (volumeError) {
        console.error(volumeError)
        throw volumeError
    }

    test('volume.rs.sectorSize',       () => expect(volume.rs.sectorSize)      .toBe(1024))
    test('volume.rs.sectorCount',      () => expect(volume.rs.sectorCount)     .toBe(1000))
    test('volume.rs.aesCipher',        () => expect(volume.rs.aesCipher)       .toBe(256))
    test('volume.rs.cryptoCompatMode', () => expect(volume.rs.cryptoCompatMode).toBe(true))

})