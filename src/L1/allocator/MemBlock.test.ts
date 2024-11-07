import { describe, test, expect } from "vitest"
import MemBlock from "./MemBlock.js"

describe('MemBlock', async () => {

    test('quick consecutive block search', () => {

        const source = [0,1,2,3, 1,0,122,123,124,125,126,127, 10,11,12,13,14, 43,44, 9]
        const get = (size: undefined | number) => MemBlock.quickConsecutiveBlockSearch(source, size)

        expect(get(3).items)        .toStrictEqual([0,1,2])
        expect(get(4).items)        .toStrictEqual([0,1,2,3])
        expect(get(5).items)        .toStrictEqual([122,123,124,125,126])
        expect(get(undefined).items).toStrictEqual([122,123,124,125,126,127])

    })

})