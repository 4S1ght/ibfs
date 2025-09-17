import { describe, test, expect } from "vitest"
import { uniform, uniformAsync, uniformS, uniformSA } from "../libs/uniform.js"
import { emptyNamespace } from "../libs/empty-namespace.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import IBFSError from "../../src/errors/IBFSError.js"

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
        const handle    = await uniformAsync(ns.open('/', '000000', { mode: 'r' }))
        const rootDir   = await uniformAsync(handle.readAsDir())

        expect(rootDir).toStrictEqual({
            children: {},
            users: { '000000': 4 },
            meta: {}
        })

    })

    test('ns.open/fh.close - Caching, locking & reference counting.', async () => {

        const name = 'l2_close'

        const ns = await useEmptyNamespace(name)
        const h1 = await uniformAsync(ns.open('/', '000000', { mode: 'r' }))
        const h2 = await uniformAsync(ns.open('/', '000000', { mode: 'r' }))
        
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
     
})