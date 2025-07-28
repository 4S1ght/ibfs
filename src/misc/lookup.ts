/**
 * Takes an array of string values and maps them to `true` in
 * order to produce a faster fast lookup table from a better
 * looking and easier to manage string array.
 */
export default function toLookup<RowItem extends string>(table: Array<RowItem>): Record<RowItem, boolean> {
    // @ts-ignore
    const result: Record<RowItem, boolean> = {}
    // @ts-ignore
    for (const row of table) result[row] = true
    return result
}