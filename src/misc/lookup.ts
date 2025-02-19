/**
 * Maps a tuple to a lookup table.
 * @param source `['some', 'keys', 'here']`
 * @returns `{ some: true, keys: true, here: true }`
 */
export function Lookup<S extends readonly string[]>(source: S): Record<S[number], boolean> {
    const acc: Record<string, boolean> = {}
    source.forEach(value => acc[value] = true)
    return acc
}