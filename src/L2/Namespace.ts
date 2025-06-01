// Imports =============================================================================================================

import type * as T from '../../types.js'
import IBFSError from '../errors/IBFSError.js'
import { TFSInit } from '../L1/Filesystem.js'

// Types ===============================================================================================================

export interface TNSInit extends TFSInit {}

// Exports =============================================================================================================

export default class Namespace {

    /**
     * Creates an empty IBFS filesystem and initializes it's namespace.
     */
    public static async createEmptyNamespace(): T.XEavSA<'L2_NS_CREATE'> {
        try {
            
        } 
        catch (error) {
            return new IBFSError('L2_NS_CREATE', null, error as Error)
        }
    }

    /**
     * Opens an IBFS volume and wraps it in a namespace allowing the user to 
     * interact with the underlying filesystem.
     */
    public static async open(): T.XEavA<Namespace, 'L2_NS_OPEN'> {
        try {
            const self = new this()
            return [null, self]
        } 
        catch (error) {
            return IBFSError.eav('L2_NS_OPEN', null, error as Error)
        }
    }

}