// Imports =============================================================================================================

import { styleText } from "node:util"
import { toGridString } from "../../misc/toGridString.js"

// Types ===============================================================================================================

interface TRefMetadata {
    refCount: number
    uToken: Symbol
    meta: Record<string | number, string | number | boolean | null>
}

interface TRef<Ref extends object> extends TRefMetadata {
    ref: WeakRef<Ref>
}

// Exports =============================================================================================================

const gray = (text: string) => styleText(['gray'], text)
const red = (text: string) => styleText(['red'], text)

/**
 * Keeps a map of registered object instances using WeakRefs internally.
 * This makes it suitable for locking and caching resources without risk
 * of memory leaks caused by unreleased references.
 * 
 * It also deploys reference counting and garbage collection for the objects.
 */
export default class InstanceRegistry<Key, Ref extends object> {

    private _refs: Map<Key, WeakRef<Ref>> = new Map()
    private _meta: Map<Key, TRefMetadata> = new Map()

    private _fr = new FinalizationRegistry<Key>((key) => {

        const meta = this._meta.get(key)

        if (meta && meta.refCount > 0) {
            console.warn(
                red(`[IBFS Cleanup Warning]\n\n`) +
                gray(
                    `An object was garbage-collected without proper cleanup. This can and probably\n`+
                    `already HAS caused loss of uncommitted in-flight data and/or corruption.\n\n`+
                    `Make sure to ALWAYS close open file handles, streams and any other open\n`+
                    `resources explicitly by calling .close() or with the "using" keyword if supported.\n\n`
                ) +
                toGridString({ 
                    'Remaining reference count': meta.refCount, 
                    'Resource Token': meta.uToken.description, 
                    ...meta.meta, 
                })
            )
        }

        this._refs.delete(key)
        this._meta.delete(key)

    })

    /**
     * Registers a new object instance within the registry.
     * @param key Key used to access the object.
     * @param ref Reference to be kept track of.
     * @param meta Metadata about the reference.
     */
    public addRef(key: Key, ref: Ref, meta: TRefMetadata['meta'] = {}): void {

        // Unregister stale value
        const cache = this._meta.get(key)
        if (cache) this._fr.unregister(cache.uToken)

        this._refs.set(key, new WeakRef(ref))
        this._meta.set(key, { refCount: 1, meta, uToken: Symbol(`ut:${key}`) })
        this._fr.register(ref, key)
    }

    /**
     * Removes a reference from the registry.
     * If the item is referenced in multiple places, it will not be removed 
     * but its reference count decreased, and only removed when the count 
     * reaches zero or is garbage-collected.
     * @param key Key used to access the object.
     */
    public removeRef(key: Key): boolean {

        const meta = this._meta.get(key)

        if (meta) {
            meta!.refCount--
            if (meta!.refCount <= 0) {
                this._refs.delete(key)
                this._meta.delete(key)
                this._fr.unregister(meta!.uToken)
                return true
            }
        }
        
        return false

    }

    /**
     * Returns the stored instance reference.
     * @param key Key used to access the object.
     */
    public getRef(key: Key): TRef<Ref> | undefined {
        const ref = this._refs.get(key)
        const meta = this._meta.get(key)
        return ref && meta && ref.deref() ? { ...meta, ref } as TRef<Ref> : undefined
    }

    /**
     * Reuses an existing instance and increases the internal reference count.
     * @param key Key used to access the object.
     */
    public reuse(key: Key): Ref | undefined {

        const ref = this._refs.get(key)
        const meta = this._meta.get(key)
        const instance = ref?.deref()

        if (instance && meta) {
            meta.refCount++
            return instance
        }

    }

    /**
     * Returns the number of active references in the registry.
     */
    public activeCount() {
        let count = 0
        for (const ref of this._refs.values()) if (ref.deref()) count++
        return count
    }

}
