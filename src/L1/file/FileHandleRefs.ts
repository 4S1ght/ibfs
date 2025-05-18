// Imports =============================================================================================================

import type FileHandle from "./FileHandle.js"

// Types ===============================================================================================================

interface HandleRef {
    /** References the open handle */ handle:   FileHandle
    /** Stores the reference count */ refCount: number
}

// Exports =============================================================================================================

/**
 * References all open read-only file handles in order to reuse them
 * for multiple reading users.
 */
export default class HandleRefs {

    private _handles: Map<number, HandleRef> = new Map() 

    /** Retrieves the handle reference for the given address */
    public getRef(address: number): HandleRef | undefined {
        return this._handles.get(address)
    }

    /** Adds a new handle reference for the given address */
    public addRef(address: number, handle: FileHandle): void {
        const ref = this._handles.get(address)
        if (ref) ref.refCount++
        else this._handles.set(address, { handle, refCount: 1 })
    }

    /** Removes a handle reference for the given address */
    public removeRef(address: number): void {

        const ref = this._handles.get(address)
        if (!ref) return

        ref.refCount--
        if (ref.refCount === 0) this._handles.delete(address)

    }

}