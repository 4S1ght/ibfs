import { describe, test, expect, beforeAll } from "vitest"
import { getFilesystemPath, useEmptyFilesystem } from './defaults/filesystem.js'
import crypto from 'node:crypto'
import Filesystem from '../src/L1/Filesystem.js'
import { KB_4, MB_1 } from "../src/Constants.js"
import BlockAESContext from "../src/L0/BlockAES.js"
import Memory from "../src/L0/Memory.js"

describe('File write streams', async () => {
    
    Buffer.poolSize = MB_1

    const [aesKeyError, aesKey] = BlockAESContext.deriveAESKey('aes-256-xts', 'hello world')
    if (aesKeyError) return expect(aesKeyError).toBeUndefined()

    let fs: Filesystem

    beforeAll(async () => {
        await useEmptyFilesystem({
            filename: 'file_write',
            blockSize: 3,
            blockCount: 1_000,
            aesCipher: "aes-256-xts",
            aesKey
        })
        const [fsError, filesystem] = await Filesystem.open(getFilesystemPath('file_write'), aesKey)
        if (fsError) {
            console.log(fsError)
            return expect(fsError).toBeUndefined()
        }
        fs = filesystem
    })

    test('Open file, stream into/out of it', async () => {
        
        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()

        const [wsError, ws] = file.createWriteStream()
        if (wsError) return expect(wsError).toBeNull()

        const writeData = crypto.randomBytes(KB_4 * 20)
        ws.write(writeData)
        ws.end()
        await new Promise<void>(resolve => ws.on('finish', () => resolve()))

        const [rsError, rs] = file.createReadStream()
        if (rsError) return expect(rsError).toBeNull()

        const readData = Memory.alloc(KB_4 * 20)
        rs.on('data', chunk => readData.write(chunk))
        await new Promise<void>((resolve) => { rs.on('close', () => resolve()) })

        expect(readData.buffer.subarray(0, KB_4)).toStrictEqual(writeData.subarray(0, KB_4))
        expect(readData.buffer.subarray(KB_4*19)).toStrictEqual(writeData.subarray(KB_4*19))

    })

    test('writeFile / readFile', async () => {
        
        const [error, file] = await fs.open(fs.volume.root.fsRoot)
        if (error) return expect(error).toBeNull()
    
        const writtenBytes = crypto.randomBytes(KB_4 * 5)

        const writeError = await file.writeFile(writtenBytes)
        if (writeError) return expect(writeError).toBeNull()
        
        const [readError, readBytes] = await file.readFile()
        if (readError) return expect(readError).toBeNull()

        expect(readBytes).toStrictEqual(writtenBytes)

    }) 

})