import { describe, test, expect } from "vitest"
import IBFSError from "../../src/errors/IBFSError.js"
import { uniform, uniformAsync, uniformSA } from "../libs/uniform.js"
import BlockAESContext from "../../src/L0/BlockAES.js"
import { emptyNamespace } from "../libs/empty-namespace.js"

describe('Namespace', () => {

    const key = uniform(BlockAESContext.deriveAESKey('aes-256-xts', 'hello world'))
    const useEmptyNamespace = (name: string) => emptyNamespace({
        filename: name,
        blockSize: 1,
        blockCount: 100,
        aesCipher: "aes-256-xts",
        aesKey: key
    })

    test('ns.createEmptyNamespace', async () => {
        const name = 'test'
        const ns = await useEmptyNamespace(name)
        expect(ns).not.toBeNull()
        console.log(ns)
    })
    
})