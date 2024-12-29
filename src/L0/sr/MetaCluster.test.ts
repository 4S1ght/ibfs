import { describe, test, expect } from 'vitest'
import MetaCluster from './MetaCluster'
import ini from 'ini'

describe('Meta cluster', () => {

    const cluster = MetaCluster.create({
        clusterSize: 1024,
        metadata: {
            ibfs: {
                string: 'some string',
                boolean: true,
            }
        }
    })

    test('in > MetaCluster.ibfs.string', () => expect(cluster.metadata.ibfs.string).toBe('some string'))
    test('in > MetaCluster.ibfs.boolean', () => expect(cluster.metadata.ibfs.boolean).toBe(true))

    const cluster2 = MetaCluster.from(cluster.buffer)
    console.log(cluster2.buffer.toString())

    test('out > MetaCluster.ibfs.string', () => expect(cluster2.metadata.ibfs.string).toBe('some string'))
    test('out > MetaCluster.ibfs.boolean', () => expect(cluster2.metadata.ibfs.boolean).toBe(true))


})