
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import SectorSerialize, { HeadSector, LinkSector, RootSector, StorageSector } from './SectorSerialize.js'
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

    const sectorMemory = SectorSerialize.createRootSector(settings)
    const sectorObject = SectorSerialize.readRootSector(sectorMemory)

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

describe('Head sector', () => {

    const settings: HeadSector = {
        created: Math.floor(Date.now()/1000),
        modified: Math.floor(Date.now()/1000),
        next: 12345,
        blockRange: 0,
        crc32Sum: zlib.crc32('test'),
        data: Buffer.from('test'),
        endPadding: 1024 - SectorSerialize.HEAD_META - 4
    }

    const ss = new SectorSerialize({ sectorSize: 1024 })
    const sectorMemory = ss.createHeadSector(settings)
    const sectorObject = ss.readHeadSector(sectorMemory)
    console.log(sectorObject)

    test('sector length', () => expect(sectorMemory.length)       .toBe(1024))
    test('created',       () => expect(sectorObject.created)      .toBe(settings.created))
    test('modified',      () => expect(sectorObject.modified)     .toBe(settings.modified))
    test('next',          () => expect(sectorObject.next)         .toBe(settings.next))
    test('blockRange',    () => expect(sectorObject.blockRange)   .toBe(settings.blockRange))
    test('crc32Sum',      () => expect(sectorObject.crc32Sum)     .toBe(settings.crc32Sum))
    test('data',          () => expect(sectorObject.data)         .toStrictEqual(settings.data))

})

describe('Link sector', () => {

    const settings: LinkSector = {
        next: 12345,
        blockRange: 0,
        crc32Sum: zlib.crc32('test'),
        data: Buffer.from('test'),
        endPadding: 1024 - SectorSerialize.LINK_META - 4
    }

    const ss = new SectorSerialize({ sectorSize: 1024 })
    const sectorMemory = ss.createLinkSector(settings)
    const sectorObject = ss.readLinkSector(sectorMemory)

    test('sector length', () => expect(sectorMemory.length)       .toBe(1024))
    test('next',          () => expect(sectorObject.next)         .toBe(settings.next))
    test('blockRange',    () => expect(sectorObject.blockRange)   .toBe(settings.blockRange))
    test('crc32Sum',      () => expect(sectorObject.crc32Sum)     .toBe(settings.crc32Sum))
    test('data',          () => expect(sectorObject.data)         .toStrictEqual(settings.data))

})

describe('Storage sector', () => {

    const settings: StorageSector = {
        next: 12345,
        blockRange: 0,
        crc32Sum: zlib.crc32('test'),
        data: Buffer.from('test'),
        endPadding: 1024 - SectorSerialize.STORE_META - 4
    }

    const ss = new SectorSerialize({ sectorSize: 1024 })
    const sectorMemory = ss.createStorageSector(settings)
    const sectorObject = ss.readStorageSector(sectorMemory)

    test('sector length', () => expect(sectorMemory.length)       .toBe(1024))
    test('next',          () => expect(sectorObject.next)         .toBe(settings.next))
    test('blockRange',    () => expect(sectorObject.blockRange)   .toBe(settings.blockRange))
    test('crc32Sum',      () => expect(sectorObject.crc32Sum)     .toBe(settings.crc32Sum))
    test('data',          () => expect(sectorObject.data)         .toStrictEqual(settings.data))

})