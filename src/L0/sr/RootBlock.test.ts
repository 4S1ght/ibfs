import { describe, test, expect } from 'vitest';
import RootBlock, { TRootBlock } from './RootBlock';
import crypto from 'crypto'

describe('Root block', () => {

    const settings: TRootBlock = {
        blockSize: 1,
        specMajor: 2,
        specMinor: 0,
        root: 100,
        aesCipher: 'aes-256-xts',
        aesIV: crypto.randomBytes(16),
        aesKeyCheck: crypto.randomBytes(16),
        blockCount: 500,
        metadataBlocks: 64,
        compatibility: true
    }

    const block1 = RootBlock.create(settings)

    test('in > blockSize',       () => expect(block1.blockSize)       .toBe(settings.blockSize))
    test('in > specMajor',       () => expect(block1.specMajor)       .toBe(settings.specMajor))
    test('in > specMinor',       () => expect(block1.specMinor)       .toBe(settings.specMinor))
    test('in > root',            () => expect(block1.root)            .toBe(settings.root))
    test('in > aesCipher',       () => expect(block1.aesCipher)       .toBe(settings.aesCipher))
    test('in > aesIV',           () => expect(block1.aesIV)           .toStrictEqual(settings.aesIV))
    test('in > aesKeyCheck',     () => expect(block1.aesKeyCheck)     .toStrictEqual(settings.aesKeyCheck))
    test('in > blockCount',      () => expect(block1.blockCount)      .toBe(settings.blockCount))
    test('in > arbitraryBlocks', () => expect(block1.metadataBlocks)  .toBe(settings.metadataBlocks))
    test('in > compatibility',   () => expect(block1.compatibility)   .toBe(settings.compatibility))

    const block2 = RootBlock.from(block1.buffer)

    test('out > blockSize ',       () => expect(block2.blockSize)       .toBe(settings.blockSize))
    test('out > specMajor ',       () => expect(block2.specMajor)       .toBe(settings.specMajor))
    test('out > specMinor ',       () => expect(block2.specMinor)       .toBe(settings.specMinor))
    test('out > root ',            () => expect(block2.root)            .toBe(settings.root))
    test('out > aesCipher ',       () => expect(block2.aesCipher)       .toBe(settings.aesCipher))
    test('out > aesIV ',           () => expect(block2.aesIV)           .toStrictEqual(settings.aesIV))
    test('out > aesKeyCheck ',     () => expect(block2.aesKeyCheck)     .toStrictEqual(settings.aesKeyCheck))
    test('out > blockCount ',      () => expect(block2.blockCount)      .toBe(settings.blockCount))
    test('out > arbitraryBlocks ', () => expect(block2.metadataBlocks)  .toBe(settings.metadataBlocks))
    test('out > compatibility ',   () => expect(block2.compatibility)   .toBe(settings.compatibility))

})