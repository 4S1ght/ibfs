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

    const write = (stream: Writable, data: Buffer) => new Promise<void>((resolve) => {
        stream.write(data)
        stream.end(resolve)
    })

    test('handle.createWriteStream (basic)', async () => {

        const fs = await useEmptyFilesystem('l1_write_stream_basic')
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

        await uniformSA(file.close())

    })

    test('handle.createWriteStream (block boundary)', async () => {

        const fs = await useEmptyFilesystem('l1_write_stream_bb')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        const data = crypto.randomBytes(1500)

        // Overwrite across block boundaries
        const stream = await uniformAsync(file.createWriteStream())
        await write(stream, data)
        expect(await uniformAsync(file.readFile())).toStrictEqual(data)

        await uniformSA(file.close())
    })

    test('handle.createWriteStream (block boundary / offset)', async () => {

        const fs = await useEmptyFilesystem('l1_write_stream_bbo')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        const data = crypto.randomBytes(2000)

        // Overwrite across block boundaries
        const stream = await uniformAsync(file.createWriteStream({ offset: 5 }))
        await write(stream, data)
        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.concat([Buffer.from([0,0,0,0,0]), data]))

        await uniformSA(file.close())

    })

    test('handle.createWriteStream (append)', async () => {

        const fs = await useEmptyFilesystem('l1_write_stream_append')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw', append: true }))

        // Append to the end (no offset)
        const stream1 = await uniformAsync(file.createWriteStream())
        await write(stream1, Buffer.from([1,2,3,4,5]))
        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.from([0,0,0,0,0,1,2,3,4,5]))

        // Append to the end (test if ignores offset in append mode)
        const stream2 = await uniformAsync(file.createWriteStream({ offset: 10000 }))
        await write(stream2, Buffer.from([1,1,1]))
        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.from([0,0,0,0,0,1,2,3,4,5,1,1,1]))

        await uniformSA(file.close())

    })

    test('fs.open (truncate)', async () => {

        const fs = await useEmptyFilesystem('l1_open_t')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw', truncate: true }))
        
        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.from([]))

        await uniformSA(file.close())

    })

    test('fs.open (truncate/append)', async () => {

        const fs = await useEmptyFilesystem('l1_open_ta')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw', truncate: true, append: true }))
        
        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.from([]))

        await uniformSA(file.write(Buffer.from([1,1,1]), 200))
        await uniformSA(file.write(Buffer.from([2,2,2]), 100))

        expect(await uniformAsync(file.readFile())).toStrictEqual(Buffer.from([1,1,1,2,2,2]))

        await uniformSA(file.close())

    })


})