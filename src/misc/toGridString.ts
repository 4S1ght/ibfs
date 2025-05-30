type Printable = string | number | null | undefined
type Key = string | number
type FlatObject = Record<Key, Printable>

export function toGridString(obj: FlatObject): string {
  const keys = Object.keys(obj)
  const colWidths: Record<string, number> = {}

  // Determine column widths
  for (const key of keys) {
    const keyLen = String(key).length
    const valLen = String(obj[key] ?? '').length
    colWidths[key] = Math.max(keyLen, valLen)
  }

  // Build key row (header)
  const header = keys
    .map(key => String(key).padEnd(colWidths[key]!))
    .join('  ')

  // Build value row
  const values = keys
    .map(key => String(obj[key] ?? '').padEnd(colWidths[key]!))
    .join('  ')

  return `${header}\n${values}`
}