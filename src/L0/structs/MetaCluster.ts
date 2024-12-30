// Imports ========================================================================================

import ini from 'ini'
import * as C from '../../Constants.js'
import RootBlock from './RootBlock'

// Types ==========================================================================================

export interface TMetaCluster {
    blockSize: keyof typeof RootBlock.BLOCK_SIZES
    metadata: Record<string, any>
}

// Exports ========================================================================================

export default class MetaCluster {

    // Internal =====================================================

    public declare buffer: Buffer
    public declare metadata: { [key: string]: Record<string, string | boolean> }

    // Methods ======================================================

    private constructor() {}

    public static create(cluster: TMetaCluster): MetaCluster {

        const self = new this()

        const blockSize = RootBlock.BLOCK_SIZES[cluster.blockSize]
        const clusterSize = blockSize * Math.ceil(C.KB_64 / blockSize) 
        self.buffer = Buffer.allocUnsafe(clusterSize).fill(0)

        const text = ini.stringify(cluster.metadata)
        self.buffer.write(text, 0, 'utf-8')
        self.metadata = cluster.metadata

        return self

    }

    public static from(buffer: Buffer): MetaCluster {

        const self = new this() // @ts-ignore
        self.buffer = buffer

        const firstNull = self.buffer.indexOf(0)
        const textEnd = firstNull != -1 ? firstNull : self.buffer.length - 1
        const text = self.buffer.toString('utf-8', 0, textEnd)
        const object = ini.parse(text)

        self.metadata = object

        return self

    }

}
