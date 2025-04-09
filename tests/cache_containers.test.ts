import crypto from 'crypto'
import { describe, test, expect, beforeAll } from "vitest"
import CacheContainers from '../src/L1/alloc/CacheContainers.js'
import BlockAES from '../src/L0/BlockAES.js'

describe('Cache containers', () => {

    test('serialize & deserialize', () => {

        const [keyError, key] = BlockAES.deriveAESKey('aes-256-xts', 'hello world')
        if (keyError) return expect(keyError).toBeUndefined()

        const uuid = crypto.randomUUID()
        const originalBitmap = crypto.randomBytes(15)

        const serialized = CacheContainers.serialize({
            bitmap: originalBitmap, 
            volumeUUID: uuid,
            cipher: 'aes-256-gcm',
            key
        })

        const { bitmap, volumeUUID } = CacheContainers.deserialize(serialized, 'aes-256-gcm', key)
        expect(bitmap).toStrictEqual(bitmap)
        expect(volumeUUID).toBe(uuid)


    })

})