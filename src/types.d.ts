/** 
 * GO-like error-as-value return type. Used specifically to avoid
 * throwing errors, which generally produces messy control flow.
 */
type Eav<V, E extends Error = Error> = [E, null] | [null, V]

/**
 * Async implementation of `Proc<value, error>`
 */
type EavAsync<V, E extends Error = Error> = Promise<[E, null] | [null, V]>

/**
 * Single-value procedural function return type.
 */
type EavSingle<E extends Error = Error> = E | void

/** 
 * Async implementation of `SProc<error>`.
*/
type EavSingleAsync<E extends Error = Error> = Promise<E | void>

/**
 * A two-number array for storing ranges.
 */
type DInt = [number, number]