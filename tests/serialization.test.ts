import crypto from 'node:crypto'
import BlockSerializationContext, { TCommonWriteMeta, TDataBlock, THeadBlock, TIndexBlockManage, TLinkBlock, TMetaCluster, TMetadataWriteMeta, TRootBlock } from '../src/L0/BlockSerialization.js'
import BlockAESContext from '../src/L0/BlockAES.js'
import * as C from '../src/Constants.js'
import { describe, test, expect } from "vitest"

describe('Block serialization & deserialization', () => {
    
    const [keyError, key] = BlockAESContext.deriveAESKey('aes-128-xts', 'hello world')
    if (keyError) return expect(keyError).toBeUndefined()
    const iv = Buffer.alloc(16)

    const bs = new BlockSerializationContext({
        blockSize: 1,
        cipher: 'aes-128-xts',
        iv
    })

    test('Root block', () => {

        const data: TRootBlock = {
            specMajor: 0,
            specMinor: 0,
            fsRoot: 0,
            aesCipher: "none",
            aesIV: crypto.randomBytes(16),
            aesKeyCheck: crypto.randomBytes(16),
            compatibility: false,
            blockSize: 1,
            blockCount: 0,
            uuid: crypto.randomUUID()
        }

        const [srError, serialized] = BlockSerializationContext.serializeRootBlock(data)
        if (srError) return expect(srError).toBeUndefined()
    
        const [dsError, deserialized] = BlockSerializationContext.deserializeRootBlock(serialized)
        if (dsError) return expect(dsError).toBeUndefined()
    
        expect(serialized.length)            .toEqual(C.KB_1)

        expect(deserialized.specMajor)       .toBe(data.specMajor)
        expect(deserialized.specMinor)       .toBe(data.specMinor)
        expect(deserialized.fsRoot)          .toBe(data.fsRoot)
        expect(deserialized.aesCipher)       .toBe(data.aesCipher)
        expect(deserialized.aesIV)           .toStrictEqual(data.aesIV)
        expect(deserialized.aesKeyCheck)     .toStrictEqual(data.aesKeyCheck)
        expect(deserialized.compatibility)   .toBe(data.compatibility)
        expect(deserialized.blockSize)       .toBe(data.blockSize)
        expect(deserialized.blockCount)      .toBe(data.blockCount)
        
    })

    test('Meta cluster', () => {
        
        const data: TMetaCluster & TMetadataWriteMeta = {
            blockSize: 1,
            metadata: {
                ibfs: {
                    originalDriverVersion: '1.0.0',
                    adSpaceCacheSize: 1024
                }
            }
        }

        const [srError, serialized] = BlockSerializationContext.serializeMetaCluster(data)
        if (srError) return expect(srError).toBeUndefined()

        const [dsError, deserialized] = BlockSerializationContext.deserializeMetaCluster(serialized)
        if (dsError) return expect(dsError).toBeUndefined()

        expect(serialized.length)   .toBeGreaterThanOrEqual(C.KB_64)
        expect(deserialized)        .toStrictEqual(data.metadata)

    })

    test('Head block', () => {

        const now = Math.floor(Date.now() / 1000)
        const data: THeadBlock & TCommonWriteMeta = {
            created: now,
            modified: now+1,
            resourceType: 'FILE',
            next: 123,
            data: Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer),
            aesKey: key,
            address: 321
        }

        const [srError, serialized] = bs.serializeHeadBlock(data)
        if (srError) return expect(srError).toBeUndefined()

        const [dsError, deserialized] = bs.deserializeHeadBlock(serialized, data.address, data.aesKey)
        if (dsError) return expect(dsError).toBeUndefined()

        expect(deserialized.blockType)      .toBe('HEAD')
        expect(deserialized.created)        .toBe(now)
        expect(deserialized.modified)       .toBe(now+1)
        expect(deserialized.resourceType)   .toBe('FILE')
        expect(deserialized.next)           .toBe(123)
        expect(deserialized.data)           .toStrictEqual(data.data)
        expect(deserialized.crc32sum)       .toBe(deserialized.crc32Computed)
        expect(deserialized.crc32Mismatch)  .toBe(false)

        // Getters/setters ---------------------------------------------------

        expect(deserialized.length)         .toBe(5)

        // Append addresses
        for (let i = 6; i <= 10; i++) {
            deserialized.append(i)
        }

        // Pop addresses
        const addresses: number[] = []
        while (true) {
            const address = deserialized.pop()
            if (address === undefined) break
            addresses.unshift(address)
        }
        expect(addresses).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

        // Get address
        deserialized.append(10)
        deserialized.append(20)
        expect(deserialized.get(0)).toBe(10)
        expect(deserialized.get(1)).toBe(20)
        expect(deserialized.get(2)).toBe(undefined)

        // Empty
        while (true) {
            if (!deserialized.pop()) break
        }
        // Append in full
        let rounds = 0
        while (true) {
            const hasSpaceLeft = deserialized.append(123)
            if (hasSpaceLeft) rounds++
            else break
        }
        expect(rounds).toEqual(bs.HEAD_ADDRESS_SPACE)

    })

    test('Link block', () => {

        const data: TLinkBlock & TCommonWriteMeta = {
            next: 123,
            data: Buffer.from(BigUint64Array.of(1n, 2n, 3n, 4n, 5n).buffer),
            aesKey: key,
            address: 321
        }

        const [srError, serialized] = bs.serializeLinkBlock(data)
        if (srError) return expect(srError).toBeUndefined()

        const [dsError, deserialized] = bs.deserializeLinkBlock(serialized, data.address, data.aesKey)    
        if (dsError) return expect(dsError).toBeUndefined()

        expect(deserialized.blockType)      .toBe('LINK')
        expect(deserialized.next)           .toBe(123)
        expect(deserialized.data)           .toStrictEqual(data.data)
        expect(deserialized.crc32sum)       .toBe(deserialized.crc32Computed)
        expect(deserialized.crc32Mismatch)  .toBe(false)

        // Getters/setters ---------------------------------------------------

        expect(deserialized.length)         .toBe(5)

        // Append addresses
        for (let i = 6; i <= 10; i++) {
            deserialized.append(i)
        }

        // Pop addresses
        const addresses: number[] = []
        while (true) {
            const address = deserialized.pop()
            if (address === undefined) break
            addresses.unshift(address)
        }
        expect(addresses).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

        // Get address
        deserialized.append(10)
        deserialized.append(20)
        expect(deserialized.get(0)).toBe(10)
        expect(deserialized.get(1)).toBe(20)
        expect(deserialized.get(2)).toBe(undefined)

        // Empty
        while (true) {
            if (!deserialized.pop()) break
        }
        // Append in full
        let rounds = 0
        while (true) {
            const hasSpaceLeft = deserialized.append(123)
            if (hasSpaceLeft) rounds++
            else break
        }
        expect(rounds).toEqual(bs.LINK_ADDRESS_SPACE)


    })

    test('Data block', () => {

        const data: TDataBlock & TCommonWriteMeta = {
            data: crypto.randomBytes(512),
            aesKey: key,
            address: 321
        }

        const [srError, serialized] = bs.serializeDataBlock(data)
        if (srError) return expect(srError).toBeUndefined()

        const [dsError, deserialized] = bs.deserializeDataBlock(serialized, data.address, data.aesKey)    
        if (dsError) return expect(dsError).toBeUndefined()

        expect(deserialized.blockType)      .toBe('DATA')
        expect(deserialized.data)           .toStrictEqual(data.data)
        expect(deserialized.crc32sum)       .toBe(deserialized.crc32Computed)
        expect(deserialized.crc32Mismatch)  .toBe(false)

        // Getters/setters ---------------------------------------------------

        const newBody = Buffer.concat([deserialized.data, Buffer.from([1, 2, 3])])
        deserialized.append(Buffer.from([1, 2, 3]))

        expect(deserialized.data).toStrictEqual(newBody)
        expect(deserialized.length).toEqual(newBody.length)


    })
    
})