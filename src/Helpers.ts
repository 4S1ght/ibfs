
/**
 * Returns a copy of an object except for the keys specified in `except` field.
 */
export function objCopyExcept<Obj extends Record<any, any>>(targetObject: Obj, except: (keyof Obj)[]) {
    const copy = { ...targetObject }
    except.forEach(key => delete copy[key])
    return copy
}