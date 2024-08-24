
/**
 * Returns a copy of an object except for the keys specified in `except` field.
 */
export function objCopyExcept<Obj extends Record<any, any>, Except extends keyof Obj>
    (targetObject: Obj, except: Except[]): Omit<Obj, Except> {
        const copy = { ...targetObject }
        except.forEach(key => delete copy[key])
        return copy
}