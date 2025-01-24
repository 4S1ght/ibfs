import { describe, test, expect, beforeAll } from "vitest"

import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import url from 'url'

import { dirname } from '../misc/relatives.js'
import FilesystemContext, { TFSInit } from './Filesystem.js'
import BlockAESContext from "../L0/BlockAES.js"

const __dirname = dirname(import.meta.url)

const keyString = 'hello world'
const alg = 'none'
const [_, key] = BlockAESContext.deriveAESKey(alg, keyString) as [null, Buffer]
const testDir = path.join(__dirname, '../../tests')
const volumeFile = path.join(testDir, 'test.ibfs')

const clear = async () => Promise.all((await fsp.readdir(testDir)).map(file => fsp.rm(path.join(testDir, file))))

describe('Filesystem', () => {

    beforeAll(async () => await clear())

    test('createFilesystemRoot', async () => {

        const init: TFSInit = {
            fileLocation: volumeFile,
            blockSize: 1,
            blockCount: 1000,
            aesCipher: alg,
            aesKey: key,
        }

        const fsCreateError = await FilesystemContext.createFilesystemRoot(init)
        if (fsCreateError) throw fsCreateError


    })

})

