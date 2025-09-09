import { describe, test, expect } from "vitest"
import { uniform, uniformAsync, uniformSA } from "../libs/uniform.js"
import { emptyFilesystem } from "../libs/empty-filesystem.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { TDirectory } from "../../src/L1/directory/DirectoryTables.js"

describe('Filesystem', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))

    const useEmptyFilesystem = (name: string) => emptyFilesystem({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    test('handle.readDir', async () => {

        const fs = await useEmptyFilesystem('l1_dir_read')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'r' }))

        const dir = await uniformAsync(file.readAsDir())
        expect(dir).toStrictEqual<TDirectory>({
            children: {},
            users: {},
            meta: {}
        })

    })

    test('handle.writeDir', async () => {

        const fs = await useEmptyFilesystem('l1_dir_read')
        const file = await uniformAsync(fs.open({ fileAddress: fs.volume.root.fsRoot, mode: 'rw' }))

        const dir: TDirectory = {
            children: {
                'Movies': 0x123,
                'Music': 0x456
            },
            users: {
                'f89422': 1,
                'f89423': 2,
                'f89424': 3
            },
            meta: {
                'comment': 'Custom comment on a directory.'
            }
        }

        await uniformSA(file.writeAsDir(dir))
        const dirRead = await uniformAsync(file.readAsDir())

        expect(dirRead).toStrictEqual(dir)

    })

})