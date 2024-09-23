import type IBFSError, { BFSErrorCode, IBFSErrorCode } from "@errors"

/** 
 * GO-like error-as-value return  type. Used specifically to avoid
 * throwing errors, which generally produces messy control flow.
 */
export type Eav<V, E extends Error = Error> = [E, null] | [null, V]
export type XEav<V, EC extends IBFSErrorCode> = [IBFSError<EC>, null] | [null, V]

/**
 * Async implementation of `Proc<value, error>`
 */
export type EavA<V, E extends Error = Error> = Promise<Eav<V, E>>
export type XEavA<V, EC extends IBFSErrorCode> = Promise<XEav<V, EC>>

/**
 * Single-value procedural function return type.
 */
export type EavS<E extends Error = Error> = E | void
export type XEavS<EC extends IBFSErrorCode> = IBFSError<EC> | void

/** 
 * Async implementation of `SProc<error>`.
*/
export type EavSA<E extends Error = Error> = Promise<EavS<E>>
export type XEavSA<EC extends IBFSErrorCode> = Promise<XEavS<EC>>

/**s
 * Extracts enum values.
 */
export type Values<T> = T[keyof T]

/** 
 * Makes selected keys optional.
*/
export type Optional<O, K extends keyof O> = Omit<O, K> & Partial<Pick<O, K>>

/**
 * Excludes the constructor first parameter.
 */
export type OmitFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never