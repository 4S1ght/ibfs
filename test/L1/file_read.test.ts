import { describe, test, expect, beforeEach } from "vitest"
import { uniform, uniformAsync, uniformSA } from "../libs/uniform.js"
import { emptyFilesystem } from "../libs/empty-filesystem.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { TCommonWriteMeta, TDataBlock, THeadBlock, TLinkBlock } from "../../src/L0/BlockSerialization.js"

describe('Filesystem', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))

    const useEmptyFilesystem = (name: string) => emptyFilesystem({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    test('read_stream', async () => {

        const fs = await useEmptyFilesystem('l1_read_stream')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        const stream = await uniformAsync(file.createReadStream())
        const chunks: Buffer[] = []

        for await (const chunk of stream) chunks.push(chunk)

        expect(Buffer.concat(chunks)).toStrictEqual(Buffer.from([0, 0, 0, 0, 0]))

    })

})