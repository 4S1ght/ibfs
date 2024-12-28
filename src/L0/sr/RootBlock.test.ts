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

    test('blockSize',       () => expect(block1.blockSize)       .toBe(settings.blockSize))
    test('specMajor',       () => expect(block1.specMajor)       .toBe(settings.specMajor))
    test('specMinor',       () => expect(block1.specMinor)       .toBe(settings.specMinor))
    test('root',            () => expect(block1.root)            .toBe(settings.root))
    test('aesCipher',       () => expect(block1.aesCipher)       .toBe(settings.aesCipher))
    test('aesIV',           () => expect(block1.aesIV)           .toStrictEqual(settings.aesIV))
    test('aesKeyCheck',     () => expect(block1.aesKeyCheck)     .toStrictEqual(settings.aesKeyCheck))
    test('blockCount',      () => expect(block1.blockCount)      .toBe(settings.blockCount))
    test('arbitraryBlocks', () => expect(block1.metadataBlocks)  .toBe(settings.metadataBlocks))
    test('compatibility',   () => expect(block1.compatibility)   .toBe(settings.compatibility))

    const block2 = RootBlock.overlay(block1.buffer)

    test('blockSize #2',       () => expect(block2.blockSize)       .toBe(settings.blockSize))
    test('specMajor #2',       () => expect(block2.specMajor)       .toBe(settings.specMajor))
    test('specMinor #2',       () => expect(block2.specMinor)       .toBe(settings.specMinor))
    test('root #2',            () => expect(block2.root)            .toBe(settings.root))
    test('aesCipher #2',       () => expect(block2.aesCipher)       .toBe(settings.aesCipher))
    test('aesIV #2',           () => expect(block2.aesIV)           .toStrictEqual(settings.aesIV))
    test('aesKeyCheck #2',     () => expect(block2.aesKeyCheck)     .toStrictEqual(settings.aesKeyCheck))
    test('blockCount #2',      () => expect(block2.blockCount)      .toBe(settings.blockCount))
    test('arbitraryBlocks #2', () => expect(block2.metadataBlocks)  .toBe(settings.metadataBlocks))
    test('compatibility #2',   () => expect(block2.compatibility)   .toBe(settings.compatibility))

})