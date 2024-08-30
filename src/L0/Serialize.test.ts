
import crypto from 'node:crypto'
import Serialize, { RootSector } from '@L0/Serialize.js'
import { describe, test, expect } from 'vitest'

describe('Root sector', () => {

    const settings: RootSector = {
        sectorSize: 1024,
        sectorCount: 500,
        specMajor: 1,
        specMinor: 2,
        rootDirectory: 1,
        aesCipher: 128,
        aesKeyCheck: crypto.randomBytes(16),
        aesIV: crypto.randomBytes(16),
        metadataSectors: 1024,
        nodeCryptoCompatMode: true
    }

    const sectorMemory = Serialize.createRootSector(settings)
    const sectorObject = Serialize.readRootSector(sectorMemory)

    test('sector length',        () => expect(sectorMemory.length)              .toBe(1024))
    test('sectorSize',           () => expect(sectorObject.sectorSize)          .toBe(settings.sectorSize))
    test('sectorCount',          () => expect(sectorObject.sectorCount)         .toBe(settings.sectorCount))
    test('specMajor',            () => expect(sectorObject.specMajor)           .toBe(settings.specMajor))
    test('specMinor',            () => expect(sectorObject.specMinor)           .toBe(settings.specMinor))
    test('rootDirectory',        () => expect(sectorObject.rootDirectory)       .toBe(settings.rootDirectory))
    test('aesCipher',            () => expect(sectorObject.aesCipher)           .toBe(settings.aesCipher))
    test('aesKeyCheck',          () => expect(sectorObject.aesKeyCheck)         .toStrictEqual(settings.aesKeyCheck))
    test('aesIV',                () => expect(sectorObject.aesIV)               .toStrictEqual(settings.aesIV))
    test('metadataSectors',      () => expect(sectorObject.metadataSectors)     .toBe(settings.metadataSectors))
    test('nodeCryptoCompatMode', () => expect(sectorObject.nodeCryptoCompatMode).toBe(settings.nodeCryptoCompatMode))

})

describe('Meta block', () => {

    const s = new Serialize({ diskSectorSize: 1024 })

    // Arbitrary config
    const original = { ibfs: { forceFlush: true } }
    const buffer = s.createMetaBlock(original)
    const processed = s.readMetaBlock(buffer)

    test('match content', () => expect(processed).toStrictEqual(original))

})
