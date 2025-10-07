import { describe, test, expect } from "vitest"
import { uniform, uniformAsync, uniformS, uniformSA } from "../libs/uniform.js"
import { emptyNamespace } from "../libs/empty-namespace.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import IBFSError from "../../src/errors/IBFSError.js"
import crypto from 'node:crypto'

describe('Namespace', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))
    const useEmptyNamespace = (name: string) => emptyNamespace({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key,
        rootGroup: '000000'
    })

    test('ns.createEmptyNamespace', async () => {
        const name = 'l2_empty_namespace'
        const ns = await useEmptyNamespace(name)
        expect(ns).not.toBeNull()
    })

    test('ns.open', async () => {

        const name = 'l2_open'

        const ns        = await useEmptyNamespace(name)
        const handle    = await uniformAsync(ns.open('/', '000000'))
        const rootDir   = await uniformAsync(handle.readAsDir())

        expect(rootDir).toStrictEqual({
            children: {},
            users: { '000000': 4 },
            meta: {}
        })

    })

    test('ns.open/fh.close - Caching, locking & reference counting.', async () => {

        const name = 'l2_open_caching'

        const ns = await useEmptyNamespace(name)
        const h1 = await uniformAsync(ns.open('/', '000000'))
        const h2 = await uniformAsync(ns.open('/', '000000'))
        
        const [h3e, h3] = await ns.open('/', '000000', { mode: 'w' })
        expect(h3e).toBeInstanceOf(IBFSError)
        expect(h3e?.has('L2_NS_LOCKED')).toBe(true)

        // @ts-ignore
        expect(ns.fs._rh._meta.get(h1.fbm.startingAddress)?.refCount).toBe(2)

        await expect(h1.close()).resolves.toBeUndefined()
        await expect(h1.close()).resolves.instanceOf(IBFSError)
        // @ts-ignore
        expect(ns.fs._rh._meta.get(h1.fbm.startingAddress)?.refCount).toBe(1)

        await expect(h2.close()).resolves.toBeUndefined()

    })

    test('ns.open (create:true) + write', async () => {

        const name = 'l2_open_create'
        const ns = await useEmptyNamespace(name)

        const h1 = await uniformAsync(ns.open('/file.txt', '000000', { mode: 'rw', create: true }))
        const [err2, h2]      = await ns.open('/file.txt', '000000', { mode: 'rw', create: true })

        // @ts-ignore
        expect(ns.vfs.tree.children['file.txt']).not.toBeUndefined()
        expect(err2!.has('L2_NS_LOCKED')).toBe(true)

        const data = crypto.randomBytes(20_000)
        await uniformSA(h1.writeFile(data))
        const read = await uniformAsync(h1.readFile())

        expect(read).toStrictEqual(data)

    })

    test('ns.writeFile/readFile', async () => {

        const name = 'l2_write_file'
        const ns = await useEmptyNamespace(name)

        const data = crypto.randomBytes(20_000)

        const err1         = await ns.writeFile('/file.txt', '000000', data)
        const [err2, read] = await ns.readFile('/file.txt',  '000000')

        expect(err1).toBe(undefined)
        expect(err2).toBe(null)
        expect(read).toStrictEqual(data)

    })

    test('ns.createReadStream', async () => {

        const name = 'l2_read_stream'
        const ns = await useEmptyNamespace(name)

        const data = crypto.randomBytes(20_000)

        const err1 = await ns.writeFile('/file.txt', '000000', data)
        expect(err1).toBe(undefined)

        const stream = await uniformAsync(ns.createReadStream('/file.txt', '000000'))

        const read = Buffer.alloc(20_000)
        let index = 0

        for await (const chunk of stream) {
            chunk.copy(read, index)
            index += chunk.length
        }

        expect(read).toStrictEqual(data)

    })

    test('ns.createWriteStream', async () => {

        const name = 'l2_write_stream'
        const ns = await useEmptyNamespace(name)

        const data = crypto.randomBytes(20_000)

        const stream = await uniformAsync(ns.createWriteStream('/file.txt', '000000'))
        
        stream.write(data)
        stream.end()

        await new Promise<void>(resolve => stream.on('finish', resolve))

        const read = await uniformAsync(ns.readFile('/file.txt', '000000'))
        expect(read).toStrictEqual(data)

    })


     
})


