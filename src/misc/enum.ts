type TEnum<T extends Record<string, string | number>> = { readonly [K in keyof T]: T[K] } 
& {
    readonly [V in T[keyof T] & (string | number)]: { [K in keyof T]: T[K] extends V ? K : never }[keyof T]
}

export default function Enum<T extends Record<string, string | number>>(obj: T): TEnum<T> {
    const result = {} as any

    for (const [key, value] of Object.entries(obj)) {
        result[key] = value
        result[value] = key
    }

    return result as TEnum<T>
}
