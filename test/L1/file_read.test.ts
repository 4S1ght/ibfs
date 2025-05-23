import { describe, test, expect } from "vitest"
import { uniform, uniformAsync } from "../libs/uniform.js"
import { emptyFilesystem } from "../libs/empty-filesystem.js"
import BlockAESContext from "../../src/L0/BlockAES.js"

describe('Filesystem', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))

    const useEmptyFilesystem = (name: string) => emptyFilesystem({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    test('handle.createReadStream', async () => {

        const fs = await useEmptyFilesystem('l1_read_stream')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        const stream = await uniformAsync(file.createReadStream())
        const chunks: Buffer[] = []

        for await (const chunk of stream) chunks.push(chunk)

        expect(Buffer.concat(chunks)).toStrictEqual(Buffer.from([0, 0, 0, 0, 0]))

    })

    test('handle.readFile', async () => {

        const fs = await useEmptyFilesystem('l1_read_stream')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))
        
        const data = await uniformAsync(file.readFile())
        expect(data).toStrictEqual(Buffer.from([0, 0, 0, 0, 0]))

    })

    test('handle.read', async () => {

        const fs = await useEmptyFilesystem('l1_read_stream')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))
        
        // Full content
        const full = await uniformAsync(file.read(0, 5))
        expect(full).toStrictEqual(Buffer.from([0, 0, 0, 0, 0]))

        // Offset (complete)
        const offset1 = await uniformAsync(file.read(3, 2))
        expect(offset1).toStrictEqual(Buffer.from([0, 0]))

        // Offset (exceeding)
        const offset2 = await uniformAsync(file.read(3, 10))
        expect(offset2).toStrictEqual(Buffer.from([0, 0]))

        // Sub-range
        const range = await uniformAsync(file.read(0, 2))
        expect(range).toStrictEqual(Buffer.from([0, 0]))

        // Overreach
        const overreach = await uniformAsync(file.read(0, 10))
        expect(overreach).toStrictEqual(Buffer.from([0, 0, 0, 0, 0]))

    })

})