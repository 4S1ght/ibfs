import { describe, test, expect, beforeEach } from "vitest"
import { uniform, uniformAsync, uniformSA } from "../libs/uniform.js"
import { emptyVolume } from "../libs/empty-volume.js"
import Volume from "../../src/L0/Volume.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { TCommonWriteMeta, TDataBlock, THeadBlock, TLinkBlock } from "../../src/L0/BlockSerialization"

describe('Volume', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))

    const useEmptyVolume = (name: string) => emptyVolume({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })


    test('read root block', async () => {

        const vol = await useEmptyVolume('l0_block_root')

        expect(vol.root.aesCipher).toBe('aes-256-xts')
        expect(vol.root.blockSize).toBe(1)
        expect(vol.root.blockCount).toBe(100)
        expect(vol.root.compatibility).toBe(true)
        expect(vol.root.specMajor).toBeTypeOf('number')
        expect(vol.root.specMinor).toBeTypeOf('number')
        expect(vol.root.aesIV).toBeInstanceOf(Buffer)
        expect(vol.root.aesKeyCheck).toBeInstanceOf(Buffer)
        expect(vol.root.fsRoot).toBe(0)

        await uniformSA(vol.close())
        
    })

    test('read/write head block', async () => {

        const vol = await useEmptyVolume('l0_block_head')
        const now = Math.floor(Date.now() / 1000)
        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blockData: THeadBlock & TCommonWriteMeta = {
            created: now,
            modified: now,
            resourceType: "FILE",
            next: 81,
            data: data,
            aesKey: key,
            address: 80,
        }

        await uniformSA(vol.writeHeadBlock(blockData))
        const block = await uniformAsync(vol.readHeadBlock(80, key))

        expect(block?.created)      .toBe(now)
        expect(block?.modified)     .toBe(now)
        expect(block?.resourceType) .toBe(blockData.resourceType)
        expect(block?.next)         .toBe(blockData.next)
        expect(block?.data)         .toStrictEqual(data)
        expect(block?.crc32sum)     .toBe(block?.crc32Computed)
        expect(block?.crc32Mismatch).toBe(false)

        await uniformSA(vol.close())

    })

    test('read/write link block', async () => {

        const vol = await useEmptyVolume('l0_block_link')
        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blockData: TLinkBlock & TCommonWriteMeta = {
            data: data,
            next: 81,
            address: 80,
            aesKey: key,
        }

        await uniformSA(vol.writeLinkBlock(blockData))
        const block = await uniformAsync(vol.readLinkBlock(80, key))

        expect(block?.data).toStrictEqual(data)
        expect(block?.next).toBe(blockData.next)

        await uniformSA(vol.close())
        
    })

    test('read/write data block', async () => {

        const vol = await useEmptyVolume('l0_block_data')
        const data = Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer)

        const blockData: TDataBlock & TCommonWriteMeta = {
            data: data,
            aesKey: key,
            address: 80,
        }

        await uniformSA(vol.writeDataBlock(blockData))
        const block = await uniformAsync(vol.readDataBlock(80, key))

        expect(block.data).toStrictEqual(data)

        await uniformSA(vol.close())
        
    })


})