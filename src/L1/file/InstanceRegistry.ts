// Imports =============================================================================================================

import { styleText } from "node:util"
import { toGridString } from "../../../dist/misc/toGridString.js"

// Types ===============================================================================================================

interface TInternalRef<Ref extends object> {
    ref: WeakRef<Ref>
    refCount: number
    meta: Record<string|number, string|number>
}

// Exports =============================================================================================================

/**
 * Keeps a map of registered object instances using WeakRefs internally.
 * This makes it suitable for locking and caching resources without risk
 * of memory leaks caused by unreleased references.
 * 
 * It also deploys reference counting and garbage collection for the objects.
 */
export default class InstanceRegistry<Key, Ref extends object> {

    private _map = new Map<Key, TInternalRef<Ref>>()

    private _fr = new FinalizationRegistry<Key>((key) => {
        
        console.log('cleared key', key)
        const heldValue = this._map.get(key)!

        if (true) {
            console.warn(styleText(
                ['redBright'],
                `[IBFS Cleanup Warning]\n`+
                `An object was garbage-collected without closing. This can and probably\n`+
                `already HAS caused loss of uncommitted in-flight data and/or corruption.\n\n`+
                `Make sure to ALWAYS close open file handles, streams and any other open\n`+
                `resources explicitly by calling .close() or with the "using" keyword if supported.\n\n`+
                `Information about the object:\n\n`+
                toGridString({ "Reference Count": heldValue.refCount, ...heldValue.meta })
            ))
        }

        for (const [key, value] of this._map) {
            if (value === value) {
                this._map.delete(key)
                break
            }
        }

    })

    /**
     * Registers a new object reference in the Instance Registry.
     * @param key 
     * @param value 
     * @param meta 
     */
    public addRef(key: Key, value: Ref, meta: Record<string, any>) {

        // const instance: TInternalRef<Ref> = {
        //     ref: new WeakRef(value),
        //     refCount: 1,
        //     meta: meta
        // }

        this._fr.register(value, key)
        // this._map.set(key, instance)
    }

    public removeRef(key: Key) {

        const instance = this._map.get(key)
        if (!instance) return

        instance.refCount--
        if (instance.refCount <= 0) this._map.delete(key)

    }

    public getRef(key: Key): Ref | undefined {

        const instance = this._map.get(key)
        if (!instance || instance.refCount <= 0) return

        return instance.ref.deref()

    }


}


setInterval(() => {}, 1000)

const reg = new InstanceRegistry<number, object>()

function makeAndKill(reg: InstanceRegistry<number, object>) {
  let temp = new Map()
  reg.addRef(123, temp, { test: 1 })
  return true // `temp` is now unreachable after this scope
}

makeAndKill(reg)
global.gc!()

