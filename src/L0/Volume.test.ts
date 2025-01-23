import fs, { write } from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import url from 'url'
import { describe, expect, test } from "vitest"

const dirname = path.dirname(url.fileURLToPath(import.meta.url))

import Volume, { TVolumeInit } from "./Volume.js"
import * as C from '../Constants.js'
import BlockAESContext from './BlockAES.js'
import { TCommonWriteMeta, TDataBlock, THeadBlock, TLinkBlock, TMetaCluster } from './BlockSerialization.js'

const keyString = 'hello world'
const alg = 'aes-256-xts'
const [_, key] = BlockAESContext.deriveAESKey(alg, keyString) as [null, Buffer]
const testDir = path.join(dirname, '../../tests')
const volumeFile = path.join(testDir, 'test.ibfs')

const volumeStat = () => fs.statSync(volumeFile)
const clear = async () => Promise.all((await fsp.readdir(testDir)).map(file => fsp.rm(path.join(testDir, file))))

describe('Volume initialization & mounting', async () => {

    await clear()

    const meta: TVolumeInit = {
        fileLocation: volumeFile,
        blockSize: 1,
        blockCount: 150,
        aesCipher: alg,
        aesKey: key
    }

    const volumeCreateError = await Volume.createEmptyVolume(meta)
    const stats = volumeStat()

    test('create error', () => expect(volumeCreateError).toBe(undefined))
    test('stat',         () => expect(stats.isFile())   .toBe(true))

    const [openError, volume] = await Volume.open(volumeFile)
    if (openError) {
        console.error(openError)
        throw openError
    }

    test('volume.rs.blockSize',     () => expect(volume.rs.blockSize)       .toBe(meta.blockSize))
    test('volume.rs.blockCount',    () => expect(volume.rs.blockCount)      .toBe(meta.blockCount))
    test('volume.rs.compatibility', () => expect(volume.rs.compatibility)   .toBe(true))
    test('volume.rs.aesCipher',     () => expect(volume.rs.aesCipher)       .toBe(alg))
    test('Volume.rs.specMajor',     () => expect(volume.rs.specMajor)       .toBe(C.SPEC_MAJOR))
    test('Volume.rs.specMinor',     () => expect(volume.rs.specMinor)       .toBe(C.SPEC_MINOR))

    test('Root block writes', async () => {

        const writeError = await volume.writeRootBlock()
        if (writeError) {
            console.log(writeError)
            throw writeError
        }

    })

    test('Meta cluster I/O', async () => {

        const meta: TMetaCluster = {
            metadata: { ibfs: { string: 'string', boolean: true } }
        }

        const writeError = await volume.writeMetaCluster(meta)
        if (writeError) {
            console.log(writeError)
            throw writeError
        }

        const [readError, cluster] = await volume.readMetaCluster()
        if (readError) {
            console.log(readError)
            throw readError
        }

        expect(cluster!.ibfs!.string).toBe('string')
        expect(cluster!.ibfs!.boolean).toBe(true)

    })

    test('Head block I/O', async () => {

        const meta: THeadBlock & TCommonWriteMeta = {
            created: Math.ceil(Date.now()/1000),
            modified: Math.ceil(Date.now()/1000),
            resourceType: 'FILE',
            data: Buffer.from('hello world'),
            aesKey: key,
            address: 100,
            next: 101,
        }

        const writeError = await volume.writeHeadBlock(meta)
        if (writeError) {
            console.log(writeError)
            throw writeError
        }

        const [readError, block] = await volume.readHeadBlock(meta.address, key)
        if (readError) {
            console.log(readError)
            throw readError
        }

        expect(block.created)      .toBe(meta.created)
        expect(block.modified)     .toBe(meta.modified)
        expect(block.resourceType) .toBe(meta.resourceType)
        expect(block.next)         .toBe(meta.next)
        expect(block.data)         .toStrictEqual(meta.data)

    })

    test('Link block I/O', async () => {

        const meta: TLinkBlock & TCommonWriteMeta = {
            data: Buffer.from('hello world'),
            aesKey: key,
            address: 101,
            next: 0,
        }

        const writeError = await volume.writeLinkBlock(meta)
        if (writeError) {
            console.log(writeError)
            throw writeError
        }

        const [readError, block] = await volume.readLinkBlock(meta.address, key)
        if (readError) {
            console.log(readError)
            throw readError
        }

        expect(block.next).toBe(meta.next)
        expect(block.data).toStrictEqual(meta.data)

    })

    test('Data block I/O', async () => {

        const meta: TDataBlock & TCommonWriteMeta = {
            data: Buffer.from('hello world'),
            aesKey: key,
            address: 102,
        }

        const writeError = await volume.writeDataBlock(meta)
        if (writeError) {
            console.log(writeError)
            throw writeError
        }

        const [readError, block] = await volume.readDataBlock(meta.address, key)
        if (readError) {
            console.log(readError)
            throw readError
        }

        expect(block.data).toStrictEqual(meta.data)

    })

})