
import { describe, test, expect } from 'vitest'
import Volume from './Volume.js'
import path from 'node:path'
import url from 'node:url'
import { CommonWriteMeta, HeadBlock, LinkBlock, StorageBlock } from './Serialize.js';
import BlockAES from './AES.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url))

// Encryption
const aesCipher              = 'aes-256-xts'
const aesKey                 = Buffer.from('Top secret!')
const [aesErr, aesKeyDigest] = BlockAES.deriveAESKey(aesCipher, aesKey)
if (aesErr) throw aesErr

describe('Create/open volume', async () => { 

    const createError = await Volume.create({
        file: path.join(dirname, '../../tests/Volume.ibfs'),
        sectorSize: 1024,
        sectorCount: 1000,
        aesCipher: aesCipher,
        aesKey: aesKey,
        driver: {
            memoryPoolSwapSize: 1024,
            memoryPoolPreloadThreshold: 1024,
            memoryPoolUnloadThreshold: 1025,
        }
    })
    if (createError) throw createError

    const [volumeError, volume] = await Volume.open(path.join(dirname, '../../tests/Volume.ibfs'))
    if (volumeError) {
        console.error(volumeError)
        throw volumeError
    }

    test('volume.rs.sectorSize',       () => expect(volume.rs.sectorSize)      .toBe(1024))
    test('volume.rs.sectorCount',      () => expect(volume.rs.sectorCount)     .toBe(1000))
    test('volume.rs.aesCipher',        () => expect(volume.rs.aesCipher)       .toBe(256))
    test('volume.rs.cryptoCompatMode', () => expect(volume.rs.cryptoCompatMode).toBe(true))


    describe('read/write meta block', async () => {

        const testObject = { ibfs: 'test' }

        const writeError = await volume.writeMetaBlock({ ibfs: 'test' })
        if (writeError) throw writeError
        const [readError, meta] = await volume.readMetaBlock()
        if (readError) throw readError

        test('read meta block changes', () => expect(meta).toStrictEqual(testObject))

    })

    describe('read/write head block', async () => {

        const meta: HeadBlock & CommonWriteMeta = {
            created: Math.floor(Date.now()/1000),
            modified: Math.floor(Date.now()/1000),
            next: 0,
            nextSize: 0,
            data: Buffer.from('Hello world!'),
            blockSize: 0,
            address: 1050,
            aesKey: aesKeyDigest
        }

        const writeError = await volume.writeHeadBlock(meta)
        if (writeError) throw writeError

        const [readError, block] = await volume.readHeadBlock(1050, aesKeyDigest)
        if (readError) throw readError

        test('block.data', () => expect(block.data).toStrictEqual(meta.data))

    })

    describe('read/write link block', async () => {

        const meta: LinkBlock & CommonWriteMeta = {
            next: 0,
            nextSize: 0,
            data: Buffer.from('Hello world!'),
            blockSize: 0,
            address: 1051,
            aesKey: aesKeyDigest
        }

        const writeError = await volume.writeLinkBlock(meta)
        if (writeError) throw writeError

        const [readError, block] = await volume.readLinkBlock(1051, 0, aesKeyDigest)
        if (readError) throw readError

        test('block.data', () => expect(block.data).toStrictEqual(meta.data))

    })

    describe('read/write storage block', async () => {

        const meta: StorageBlock & CommonWriteMeta = {
            data: Buffer.from('Hello world!'),
            blockSize: 0,
            address: 1052,
            aesKey: aesKeyDigest
        }

        const writeError = await volume.writeStoreBlock(meta)
        if (writeError) throw writeError

        const [readError, block] = await volume.readStoreBlock(1052, 0, aesKeyDigest)
        if (readError) throw readError

        test('block.data', () => expect(block.data).toStrictEqual(meta.data))

    })


})