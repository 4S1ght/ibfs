
import crypto from 'node:crypto'
import Serialize, { CommonWriteMeta, HeadBlock, RootSector } from '@L0/Serialize.js'
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
        nodeCryptoCompatMode: true
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
    test('nodeCryptoCompatMode', () => expect(sectorObject.nodeCryptoCompatMode).toBe(settings.nodeCryptoCompatMode))

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

    describe('AES', () => {

        const s = new Serialize({ 
            diskSectorSize: 1024,
            cipher: 'aes-256-xts',
            iv: Buffer.alloc(16)
        })

        const aesKey = Buffer.from('12345'.padEnd(64))
        const original: HeadBlock & CommonWriteMeta = {
            created: Math.floor(Date.now()/1000),
            modified: Math.floor(Date.now()/1000),
            data: Buffer.alloc(3200).fill(1),
            next: 12345,
            blockRange: 3,
            address: 10_000,
            aesKey: aesKey,
        }
    
        describe('de/serialize instant', () => {
    
            const [cError, buffer] = s.createHeadBlock(original)
            if (cError) throw cError
            console.log(buffer.join(','))
            const [rError, processed] = s.readHeadBlockInstant(buffer, 10_000, 3, aesKey)
            if (rError) throw rError
    
            test('created',    () => expect(processed.created)   .toBe(original.created))
            test('modified',   () => expect(processed.modified)  .toBe(original.modified))
            test('next',       () => expect(processed.next)      .toBe(original.next))
            test('blockRange', () => expect(processed.blockRange).toBe(original.blockRange))
            // test('data',       () => expect(processed.data)      .toStrictEqual(original.data))
    
        })
    
        // describe('de/serialize lazy', () => {
    
        //     const [cError, buffer] = s.createHeadBlock(original)
        //     if (cError) throw cError
    
        //     const b = Memory.intake(buffer)
    
        //     const [rError1, partial] = s.readHeadBlock(b.read(s.HEAD_CONTENT), 10_000)
        //     if (rError1) throw rError1
        //     const [rError2, finished] = partial.final(b.readRemaining())
        //     if (rError2) throw rError2
    
        //     test('created',    () => expect(partial.metadata.created)   .toBe(original.created))
        //     test('modified',   () => expect(partial.metadata.modified)  .toBe(original.modified))
        //     test('next',       () => expect(partial.metadata.next)      .toBe(original.next))
        //     test('blockRange', () => expect(partial.metadata.blockRange).toBe(original.blockRange))
        //     test('data',       () => expect(finished)                   .toStrictEqual(original.data))
    
        // })

    })

})
