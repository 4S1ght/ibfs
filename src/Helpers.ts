
/**
 * Returns a copy of an object except for the keys specified in `except` field.
 * Used for filtering sensitive metadata from errors thrown inside the driver.
 */
export function sanitize<Obj extends Record<any, any>, Except extends keyof Obj>
    (targetObject: Obj, except: Except[]): Omit<Obj, Except> {
        const copy = { ...targetObject }
        except.forEach(key => delete copy[key])
        return copy
}