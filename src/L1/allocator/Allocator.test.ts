import { describe, test, expect } from "vitest"
import Allocator from "./Allocator.js"
import url from 'node:url'
import path from 'node:path'

const dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Allocator', async () => {

    test('qcbs (quick consecutive block search)', () => {

        const source = [0,1,2,3, 1,0,122,123,124,125,126,127, 10,11,12,13,14, 43,44]
        const get = (size: undefined | number) => Allocator.qcbs(source, size)

        expect(get(3).items)            .toStrictEqual([0,1,2])
        expect(get(4).items)            .toStrictEqual([0,1,2,3])
        expect(get(5).items)            .toStrictEqual([122,123,124,125,126])
        expect(get(undefined).items)    .toStrictEqual([122,123,124,125,126,127])
        expect(Allocator.qcbs([]).items).toStrictEqual([])

    })

    test('Allocator', async () => {

        const [error, allocator] = await Allocator.instance({
            poolSize: 1000,
            chunkSize: 25,
            chunkPreloadThreshold: 1,
            chunkUnloadThreshold: 2,
            location: path.join(dirname, '../../../tests/allocator/')
        })
        if (error) throw error

        const addresses = new Array(1000).fill(0).map((_, i) => i)
        const freeError = await allocator.load(addresses)
        if (freeError) {
            console.log(freeError)
            throw freeError
        }
        // console.log(allocator.chunks)

        // console.log(allocator.chunks[allocator.chunks.length-1].addresses.join(' '))


    })


})

