import { describe, test, expect } from 'vitest'
import DirectoryTranscode, { Directory } from '@L1/DirectorySerialize.js'

describe('Directory encode/decode', async () => {

    const [initError, transcoder] = await DirectoryTranscode.instance()
    if (initError) throw initError

    const testObject: Directory = {
        permissions: {
            'test-user-id-1': 1,
            'test-user-id-2': 2,
            'test-user-id-3': 3,
        },
        children: {
            'resume.pdf': 123567890,
            'some folder': 987654321
        }
    }

    let serialized: any

    test('serialize', () => {
        const [err, buf] = transcoder.serializeDirectoryObject(testObject)
        expect(err).toBe(null)
        expect(buf).toBeInstanceOf(Uint8Array)
        serialized = buf
    })

    test('deserialize', () => {
        const [err, obj] = transcoder.deserializeDirectoryObject(serialized)
        expect(err).toBe(null)
        expect(obj).toStrictEqual(testObject)
    })


})