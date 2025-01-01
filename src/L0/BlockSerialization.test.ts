import { describe, test, expect } from 'vitest'
import crypto from 'node:crypto'
import BlockSerializationContext, { TRootBlock } from './BlockSerialization'

describe('Root Block de/serialization', () => {

    const data: TRootBlock = {
        specMajor: 2,
        specMinor: 1,
        root: 0,
        aesCipher: 'none',
        aesIV: crypto.randomBytes(16),
        aesKeyCheck: crypto.randomBytes(16),
        compatibility: true,
        blockSize: 1,
        blockCount: 0
    }

    const [srError, serialized] = BlockSerializationContext.serializeRootBlock(data)
    if (srError) return expect(srError).toBeUndefined()
    console.log(serialized)

    const [dsError, deserialized] = BlockSerializationContext.deserializeRootBlock(serialized)
    if (dsError) return expect(dsError).toBeUndefined()

    console.log(deserialized)

    test('sr/specMajor',        () => expect(deserialized.specMajor)       .toBe(data.specMajor))
    test('sr/specMinor',        () => expect(deserialized.specMinor)       .toBe(data.specMinor))
    test('sr/root',             () => expect(deserialized.root)            .toBe(data.root))
    test('sr/aesCipher',        () => expect(deserialized.aesCipher)       .toBe(data.aesCipher))
    test('sr/aesIV',            () => expect(deserialized.aesIV)           .toStrictEqual(data.aesIV))
    test('sr/aesKeyCheck',      () => expect(deserialized.aesKeyCheck)     .toStrictEqual(data.aesKeyCheck))
    test('sr/compatibility',    () => expect(deserialized.compatibility)   .toBe(data.compatibility))
    test('sr/blockSize',        () => expect(deserialized.blockSize)       .toBe(data.blockSize))
    test('sr/blockCount',       () => expect(deserialized.blockCount)      .toBe(data.blockCount))



})