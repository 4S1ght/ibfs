// Imports =============================================================================================================

import type * as T from '../../types.js'
import IBFSError from '../errors/IBFSError.js'
import Filesystem, { TFSInit } from '../L1/Filesystem.js'
import VFS from './VFS.js'

// Types ===============================================================================================================

export interface TNSInit extends TFSInit {}

// Exports =============================================================================================================

export default class Namespace {

    // Static ----------------------------------------------------------------------------------------------------------

    // Initial ---------------------------------------------------------------------------------------------------------

    private declare fs: Filesystem
    private declare vfs: VFS

    // Factory ---------------------------------------------------------------------------------------------------------

    /**
     * Creates an empty IBFS filesystem and initializes it's namespace.
     */
    public static async createEmptyNamespace(options: TNSInit): T.XEavSA<'L2_NS_CREATE'> {
        try {
            
            // Create filesystem -----------------------------------------
            const fsError = await Filesystem.createEmptyFilesystem(options)
            if (fsError) return new IBFSError('L2_NS_CREATE', null, fsError)
            
        } 
        catch (error) {
            return new IBFSError('L2_NS_CREATE', null, error as Error)
        }
    }

    // Lifecycle -------------------------------------------------------------------------------------------------------

    /**
     * Opens an IBFS volume and wraps it in a namespace allowing the user to 
     * interact with the underlying filesystem.
     */
    public static async open(image: string, aesKey: Buffer): T.XEavA<Namespace, 'L2_NS_OPEN'> {
        try {

            const self = new this()
            self.vfs = new VFS()

            const [fsError, fs] = await Filesystem.open(image, aesKey)
            if (fsError) return IBFSError.eav('L2_NS_OPEN', null, fsError)
            self.fs = fs
        
            const treeScanError = await self.scanFilesystemTree()
            if (treeScanError) return IBFSError.eav('L2_NS_OPEN', null, treeScanError)

            

            return [null, self]

        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN', null, error as Error)
        }
    }

    private async scanFilesystemTree(): T.XEavSA<'L2_NS_SCAN_TREE'> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L2_NS_SCAN_TREE', null, error as Error)
        }
    }

}