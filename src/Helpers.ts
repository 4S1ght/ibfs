
/**
 * "Safe-shallow-copy" is a function used to shallowly copy an object except
 * for specific properties in order to embed it inside errors.
 */
export function ssc<Obj extends Record<any, any>, Except extends keyof Obj>
    (targetObject: Obj, except: Except[]): Omit<Obj, Except> {
        const copy = { ...targetObject }
        except.forEach(key => delete copy[key])
        return copy
}