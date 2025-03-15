import IBFSError, { IBFSErrorCode } from './src/errors/IBFSError.js'

/** 
 * GO-like error-as-value return  type. Used specifically to avoid
 * throwing errors, which generally produces messy control flow.
 */
export type Eav<V, E extends Error = Error> = [E, null] | [null, V]
export type XEav<V, EC extends IBFSErrorCode> = [IBFSError<EC>, null] | [null, V]

/**
 * Similar to Eav, but does not enforce either error or value.
 * Both are returned to allow for more graceful error handling.
 */
export type EavG<V, E extends Error = Error> = [E, null]
export type XEavG<V, EC extends IBFSErrorCode> = [IBFSError<EC>, null]

/**
 * Async implementation of `Eav<value, error>`
 */
export type EavA<V, E extends Error = Error> = Promise<Eav<V, E>>
export type XEavA<V, EC extends IBFSErrorCode> = Promise<XEav<V, EC>>

/**
 * Single-value procedural function return type.
 */
export type EavS<E extends Error = Error> = E | void
export type XEavS<EC extends IBFSErrorCode> = IBFSError<EC> | void

/** 
 * Async implementation of `EavS<error>`.
*/
export type EavSA<E extends Error = Error> = Promise<EavS<E>>
export type XEavSA<EC extends IBFSErrorCode> = Promise<XEavS<EC>>

/** 
 * Async implementation of `EavG<error>`.
*/
export type EavGA<V, E extends Error = Error> = Promise<[E, null]>
export type XEavGA<V, EC extends IBFSErrorCode> = Promise<[IBFSError<EC>, null]>

/**
 * Excludes the first constructor parameter.
 */
export type OmitFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never

