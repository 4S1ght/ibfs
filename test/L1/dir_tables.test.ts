
import { describe, test, expect, beforeAll } from "vitest"
import DirectoryTable, { TDirectoryTable } from "../../src/L1/tables/DirectoryTables.js"

describe('Directory tables', () => {

    test('table de/serialization', () => {

        const table: TDirectoryTable = {
            ch: {
                'hello-world.txt': 12345
            },
            usr: {
                'f8cb2a': 1
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