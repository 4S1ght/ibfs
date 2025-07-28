
import { describe, test, expect, beforeAll } from "vitest"
import DirectoryTable, { TDirectory } from "../../src/L1/directory/DirectoryTables.js"

describe('Directory tables', () => {

    test('table de/serialization', () => {

        const table: TDirectory = {
            ch: {
                'hello-world.txt': 12345
            },
            usr: {
                'f8cb2a': 1,
                '00acc8': 2
            },
            md: {
                'foo': 'bar'
            }
        }
    
        const serialized = DirectoryTable.serializeDRTable(table)
        const deserialized = DirectoryTable.deserializeDRTable(serialized)
    
        expect(deserialized).toStrictEqual(table)
        
    })

})