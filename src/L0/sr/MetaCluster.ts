// Imports ========================================================================================

import ini from 'ini'

// Types ==========================================================================================

export interface TMetaCluster {
    clusterSize: number
    metadata: Record<string, any>
}

// Exports ========================================================================================

export default class MetaCluster {

    // Internal =====================================================

    public declare readonly buffer: Buffer
    public declare metadata: { [key: string]: Record<string, string | boolean> }

    // Methods ======================================================

    private constructor() {}

    public static create(cluster: TMetaCluster): MetaCluster {

        const self = new this() // @ts-ignore
        self.buffer = Buffer.allocUnsafe(cluster.clusterSize).fill(0)

        const text = ini.stringify(cluster.metadata)
        self.buffer.write(text, 0, 'utf-8')
        self.metadata = cluster.metadata

        return self

    }

    public static from(buffer: Buffer): MetaCluster {

        const self = new this() // @ts-ignore
        self.buffer = buffer

        const textEnd = self.buffer.indexOf(0)
        const text = self.buffer.toString('utf-8', 0, textEnd)
        const object = ini.parse(text)

        self.metadata = object

        return self

    }

}
