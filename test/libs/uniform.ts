import type * as T from '../../types'

export function uniform<V, E extends Error>(result: T.Eav<V, E>): NonNullable<V> {
    const [error, value] = result
    if (error !== null) throw error
    return value!
}

export async function uniformAsync<V, E extends Error>(promise: T.EavA<V, E>): Promise<NonNullable<V>> {
    const [error, value] = await promise
    if (error !== null) throw error
    return value!
}
