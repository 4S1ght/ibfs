import { describe, test, expect } from "vitest"
import DirectoryBuffersContext, { TDirectory } from "./DirectoryBuffers.js"

test('Directory buffers de/serialization', async () => {

    const [dirError, dir] = await DirectoryBuffersContext.create()
    if (dirError) throw dirError

    const example: TDirectory = {
        permissions: {
            root: 3,
            user: 2,
            guest: 1,
        },
        children: {
            'hello.txt': 0,
            'hello2.txt': 1
        }
    }

    const [srError, serialized] = dir.serializeDirectory(example)
    if (srError) throw srError

    const [dsError, deserialized] = dir.deserializeDirectory(serialized)
    if (dsError) throw dsError

    expect(deserialized).toStrictEqual(example)

})