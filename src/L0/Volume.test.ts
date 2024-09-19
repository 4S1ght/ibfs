
import { describe, test, expect } from 'vitest'
import Volume from './Volume.js'
import path from 'node:path'
import url from 'node:url'

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

describe('Create volume', async () => { 

    test('x', () => expect(true).toBe(true))

    const createError = await Volume.create({
        file: path.join(dirname, '../../tests/Volume.ibfs'),
        sectorSize: 1024,
        sectorCount: 1000,
        aesCipher: '',
        update: {
            frequency: 10_000,
            callback: (status, written) => {
                // console.log(status, written)
            }
        }
    })

    if (createError) throw createError
    test('createError', () => expect(createError).toBe(undefined))

    await new Promise(r => setTimeout(r, 500))


})