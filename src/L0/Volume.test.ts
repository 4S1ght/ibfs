
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
        aesCipher: 'aes-128-xts',
        aesKey: 'Hello world!',
        // update: {
            // frequency: 10_000,
            // callback: (status, written) => {
            //     console.log(status, written)
            // }
        // }
    })
    if (createError) throw createError

    const [volumeError, volume] = await Volume.open(path.join(dirname, '../../tests/Volume.ibfs'))
    if (volumeError) {
        console.error(volumeError)
        throw volumeError
    }

    test('volume.rs', () => expect(volume.rs).toBeDefined())

})