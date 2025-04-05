
import { describe, test, expect, beforeAll } from "vitest"
import DirectoryTables, { TDirectoryTable } from "../src/L0/DirectoryTables.js"

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
    
        const serialized = DirectoryTables.serializeDRTable(table)
        const deserialized = DirectoryTables.deserializeDRTable(serialized)
    
        expect(deserialized).toStrictEqual(table)
        
    })

})