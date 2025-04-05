import { describe, test, expect, beforeAll } from "vitest"
import Volume from '../src/L0/Volume'
import { useEmptyVolume, getVolumePath } from './defaults/volume'
import BlockAESContext from "../src/L0/BlockAES"
import { TCommonWriteMeta, TDataBlock, THeadBlock, TLinkBlock } from "../src/L0/BlockSerialization"

describe('Volume initialization and IO', async () => {

    const [keyError, key] = BlockAESContext.deriveAESKey('aes-256-xts', 'my key')
    if (keyError) return expect(keyError).toBeUndefined()

    let vol: Volume

    beforeAll(async () => {
        await useEmptyVolume({
            filename: 'init_and_io',
            blockSize: 1,
            blockCount: 1000,
            aesCipher: "aes-256-xts",
            aesKey: key
        })
        const [volumeError, volume] = await Volume.open(getVolumePath('init_and_io'))
        if (volumeError) {
            console.log(volumeError)
            return expect(volumeError).toBeUndefined()
        }
        vol = volume
    })

    test('Reading block state', () => {

        expect(vol.root.aesCipher).toBe('aes-256-xts')
        expect(vol.root.blockSize).toBe(1)
        expect(vol.root.blockCount).toBe(1000)
        expect(vol.root.compatibility).toBe(true)
        expect(vol.root.specMajor).toBeTypeOf('number')
        expect(vol.root.specMinor).toBeTypeOf('number')
        expect(vol.root.aesIV).toBeInstanceOf(Buffer)
        expect(vol.root.aesKeyCheck).toBeInstanceOf(Buffer)
        expect(vol.root.fsRoot).toBe(0)
        
    })

    test('Writing & reading a head block', async () => {

        const now = Math.floor(Date.now() / 1000)
        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blockData: THeadBlock & TCommonWriteMeta = {
            created: now,
            modified: now,
            resourceType: "FILE",
            next: 101,
            data: data,
            aesKey: key,
            address: 100,
        }

        const writeError = await vol.writeHeadBlock(blockData)
        if (writeError) return expect(writeError).toBeUndefined()

        const [readError, block] = await vol.readHeadBlock(100, key)

        expect(readError)           .toBeNull()
        expect(block?.created)      .toBe(now)
        expect(block?.modified)     .toBe(now)
        expect(block?.resourceType) .toBe(blockData.resourceType)
        expect(block?.next)         .toBe(blockData.next)
        expect(block?.data)         .toStrictEqual(data)
        expect(block?.crc32sum)     .toBe(block?.crc32Computed)
        expect(block?.crc32Mismatch).toBe(false)

    })

    test('Writing & reading a link block', async () => {

        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blocKData: TLinkBlock & TCommonWriteMeta = {
            data: data,
            next: 101,
            address: 100,
            aesKey: key,
        }

        const writeError = await vol.writeLinkBlock(blocKData)
        if (writeError) return expect(writeError).toBeUndefined()

        const [readError, block] = await vol.readLinkBlock(100, key)

        expect(readError)           .toBeNull()
        expect(block?.data)         .toStrictEqual(data)
        expect(block?.next)         .toBe(blocKData.next)

    })

    test('Writing & reading a data block', async () => {

        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blockData: TDataBlock & TCommonWriteMeta = {
            data: data,
            aesKey: key,
            address: 100,
        }

        const writeError = await vol.writeDataBlock(blockData)
        if (writeError) return expect(writeError).toBeUndefined()

        const [readError, block] = await vol.readDataBlock(100, key)

        expect(readError)           .toBeNull()
        expect(block?.data)         .toStrictEqual(data)
    })

})