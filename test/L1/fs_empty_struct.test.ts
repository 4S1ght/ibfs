import { describe, test, expect } from "vitest"
import { uniform, uniformAsync, uniformSA } from "../libs/uniform.js"
import { emptyFilesystem } from "../libs/empty-filesystem.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { Readable, Writable } from "stream"
import crypto from 'crypto'

describe('Filesystem', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))
    const useEmptyFilesystem = (name: string) => emptyFilesystem({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    test('fs.createEmptyStructure (file)', async () => {

        const fs = await useEmptyFilesystem('l1_create_empty_struct_file')
        const address = await uniformAsync(fs.createEmptyStructure({ type: 'FILE' }))

        const fh = await uniformAsync(fs.open({ fileAddress: address, mode: 'rw' }))
        const data = await uniformAsync(fh.readFile())
        expect(data).toStrictEqual(Buffer.from([]))

    })

    test('fs.createEmptyStructure (file)', async () => {

        const fs = await useEmptyFilesystem('l1_create_empty_struct_dir')
        const address = await uniformAsync(fs.createEmptyStructure({ type: 'DIR' }))

        const fh = await uniformAsync(fs.open({ fileAddress: address, mode: 'rw' }))
        const data = await uniformAsync(fh.readAsDir())
        expect(data).toStrictEqual({
            ch: {},
            usr: {},
            md: {},
        })

    })

})