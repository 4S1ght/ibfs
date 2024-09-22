
import crypto from 'node:crypto'
import Serialize, { CommonWriteMeta, HeadBlock, RootSector, LinkBlock } from '@L0/Serialize.js'
import { describe, test, expect } from 'vitest'
import Memory from './Memory.js'

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
        cryptoCompatMode: true
    }

    const [sError, sectorMemory] = Serialize.createRootSector(settings)
    if (sError) throw sError

    const [dsError, sectorObject] = Serialize.readRootSector(sectorMemory)
    if (dsError) throw sError

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
    test('cryptoCompatMode', () => expect(sectorObject.cryptoCompatMode).toBe(settings.cryptoCompatMode))

})

describe('Meta block', () => {

    const s = new Serialize({ 
        diskSectorSize: 1024,
        cipher: '',
        iv: Buffer.alloc(16)
    })

    // Arbitrary config
    const original = { ibfs: { forceFlush: true } }

    const [cError, buffer] = s.createMetaBlock(original)
    if (cError) throw cError

    const [rError, processed] = s.readMetaBlock(buffer)
    if (rError) throw rError

    test('de/serialize match', () => expect(processed).toStrictEqual(original))

})

describe('Head block', () => {

    const s = new Serialize({ 
        diskSectorSize: 1024,
        cipher: 'aes-256-xts',
        iv: Buffer.alloc(16)
    })

    const aesKey = Buffer.from('12345'.padEnd(64))
    const original: HeadBlock & CommonWriteMeta = {
        created: Math.floor(Date.now()/1000),
        modified: Math.floor(Date.now()/1000),
        data: crypto.randomBytes(3200),
        next: 12345,
        nextSize: 0,
        blockSize: 3,
        address: 10_000,
        aesKey: aesKey,
    }

    const [cError, headBlockRaw] = s.createHeadBlock(original)
    if (cError) throw cError
    const headBlock = Memory.intake(headBlockRaw)

    const head = s.readHeadBlock(headBlock.read(1024), 10_000, aesKey)
    if (head.error) throw head.error

    const finalError = head.final(headBlock.readRemaining())
    if (finalError) throw finalError

    test('created',   () => expect(head.meta.created)   .toBe(original.created))
    test('modified',  () => expect(head.meta.modified)  .toBe(original.modified))
    test('next',      () => expect(head.meta.next)      .toBe(original.next))
    test('nextSize',  () => expect(head.meta.nextSize)  .toBe(original.nextSize))
    test('blockSize', () => expect(head.meta.blockSize) .toBe(original.blockSize))
    test('data',      () => expect(head.meta.data)      .toStrictEqual(original.data))

})

describe('Link block', () => {

    const s = new Serialize({ 
        diskSectorSize: 1024,
        cipher: 'aes-256-xts',
        iv: Buffer.alloc(16)
    })

    const aesKey = Buffer.from('12345'.padEnd(64))
    const original: LinkBlock & CommonWriteMeta = {
        data: crypto.randomBytes(3200),
        next: 12345,
        nextSize: 0,
        blockSize: 3,
        address: 10_000,
        aesKey: aesKey,
    }

    const [createError, linkBlock] = s.createLinkBlock(original)
    if (createError) throw createError

    const lr = s.readLinkBlock(linkBlock, 10_000, aesKey)
    if (lr.error) throw lr.error

    test('next',      () => expect(lr.meta.next)      .toBe(original.next))
    test('nextSize',  () => expect(lr.meta.nextSize)  .toBe(original.nextSize))
    test('blockSize', () => expect(lr.meta.blockSize) .toBe(original.blockSize))
    test('data',      () => expect(lr.meta.data)      .toStrictEqual(original.data))
    test('crc',       () => expect(lr.crcMismatch)    .toBe(false))

})

describe('Store block', () => {

    const s = new Serialize({ 
        diskSectorSize: 1024,
        cipher: 'aes-256-xts',
        iv: Buffer.alloc(16)
    })

    const aesKey = Buffer.from('12345'.padEnd(64))
    const original: LinkBlock & CommonWriteMeta = {
        data: crypto.randomBytes(3200),
        next: 12345,
        nextSize: 0,
        blockSize: 3,
        address: 10_000,
        aesKey: aesKey,
    }

    const [createError, linkBlock] = s.createStorageBlock(original)
    if (createError) throw createError

    const sr = s.readStorageBlock(linkBlock, 10_000, aesKey)
    if (sr.error) throw sr.error

    test('blockSize', () => expect(sr.meta.blockSize) .toBe(original.blockSize))
    test('data',      () => expect(sr.meta.data)      .toStrictEqual(original.data))
    test('crc',       () => expect(sr.crcMismatch)    .toBe(false))

})