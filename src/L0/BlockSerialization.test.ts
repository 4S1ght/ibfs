import { describe, test, expect } from 'vitest'
import crypto from 'node:crypto'
import BlockSerializationContext, { TMetaCluster, TRootBlock } from './BlockSerialization'
import * as C from '../Constants.js'

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

    const [dsError, deserialized] = BlockSerializationContext.deserializeRootBlock(serialized)
    if (dsError) return expect(dsError).toBeUndefined()

    test('buffer length',    () => expect(serialized.length)            .toEqual(C.KB_1))

    test('specMajor',        () => expect(deserialized.specMajor)       .toBe(data.specMajor))
    test('specMinor',        () => expect(deserialized.specMinor)       .toBe(data.specMinor))
    test('root',             () => expect(deserialized.root)            .toBe(data.root))
    test('aesCipher',        () => expect(deserialized.aesCipher)       .toBe(data.aesCipher))
    test('aesIV',            () => expect(deserialized.aesIV)           .toStrictEqual(data.aesIV))
    test('aesKeyCheck',      () => expect(deserialized.aesKeyCheck)     .toStrictEqual(data.aesKeyCheck))
    test('compatibility',    () => expect(deserialized.compatibility)   .toBe(data.compatibility))
    test('blockSize',        () => expect(deserialized.blockSize)       .toBe(data.blockSize))
    test('blockCount',       () => expect(deserialized.blockCount)      .toBe(data.blockCount))

})

describe('Meta cluster de/code', () => {

    const metadata: TMetaCluster['metadata'] = {
        ibfs: {
            string: 'string',
            boolean: true
        }
    }

    const [srError, serialized] = BlockSerializationContext.serializeMetaCluster({ metadata, blockSize: 1024 })
    if (srError) return expect(srError).toBeUndefined()

    const [dsError, deserialized] = BlockSerializationContext.deserializeMetaCluster(serialized)
    if (dsError) return expect(dsError).toBeUndefined()

    test('buffer length', () => expect(serialized.length).toBeGreaterThanOrEqual(C.KB_64))
    test('metadata',      () => expect(deserialized.metadata).toEqual(metadata))


})