import { describe, test, expect } from "vitest"
import AddressStack from "./AddressStack.js"
import path from "node:path"
import url from 'node:url'

const dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('initialize address stack', async () => {
    
    const [stackError, stack] = await AddressStack.instance({
        poolSize: 100,
        chunkSize: 10,
        chunkPreloadThreshold: 2,
        chunkUnloadThreshold: 2,
        location: path.join(dirname, '../../../tests/stack'),
        timeWheel: {
            bucketCount: 10,
            tickDuration: 100,
            idleAfterTicks: 30
        }
    })
    if (stackError) throw stackError

})