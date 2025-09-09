
import { describe, test, expect, beforeAll } from "vitest"
import DirectoryTable, { TDirectory } from "../../src/L1/directory/DirectoryTables.js"

describe('Directory tables', () => {

    test('table de/serialization', () => {

        const table: TDirectory = {
            children: {
                'hello-world.txt': 12345
            },
            users: {
                'f8cb2a': 1,
                '00acc8': 2
            },
            meta: {
                'foo': 'bar'
            }
        }
    
        const serialized = DirectoryTable.serialize(table)
        const deserialized = DirectoryTable.deserialize(serialized)
    
        expect(deserialized).toStrictEqual(table)
        
    })

})