import { describe, test, expect } from "vitest"
import { uniform, uniformAsync } from "../libs/uniform.js"
import { emptyFilesystem } from "../libs/empty-filesystem.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { Readable, Writable } from "stream"

describe('Filesystem', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))
    const useEmptyFilesystem = (name: string) => emptyFilesystem({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    const write = (stream: Writable, data: Buffer) => new Promise<void>((resolve) => {
        stream.write(data)
        stream.end(resolve)
    })

    test('handle.createWriteStream', async () => {

        const fs = await useEmptyFilesystem('l1_write_stream')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        // Overwrite
        const stream1 = await uniformAsync(file.createWriteStream())
        await write(stream1, Buffer.from([1,2,3,4,5,6,7,8,9]))
        expect(await uniformAsync(file.readFile()))
        .toStrictEqual(Buffer.from([1,2,3,4,5,6,7,8,9]))

        // Partial overwrite
        const stream2 = await uniformAsync(file.createWriteStream())
        await write(stream2, Buffer.from([0,0,0]))
        expect(await uniformAsync(file.readFile()))
        .toStrictEqual(Buffer.from([0,0,0,4,5,6,7,8,9]))

        // Offset overwrite
        const stream3 = await uniformAsync(file.createWriteStream({ offset: 3 }))
        await write(stream3, Buffer.from([1,1,1]))
        expect(await uniformAsync(file.readFile()))
        .toStrictEqual(Buffer.from([0,0,0,1,1,1,7,8,9]))

        // Offset shingled overwrite
        const stream4 = await uniformAsync(file.createWriteStream({ offset: 6 }))
        await write(stream4, Buffer.from([2,2,2,2,2,2]))
        expect(await uniformAsync(file.readFile()))
        .toStrictEqual(Buffer.from([0,0,0,1,1,1,2,2,2,2,2,2]))

    })



})