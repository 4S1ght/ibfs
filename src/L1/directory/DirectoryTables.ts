// Imports =============================================================================================================

import Memory from "../../L0/Memory.js"

// Types ===============================================================================================================

type TPermLevel = 0 | 1 | 2 | 3
export interface TDirectory {
    /** Directory's children items. */
    ch: Record<string, number>,
    /** Defines directory read permissions for each user - none/read/write/exec (cascading). */
    usr: Record<string, TPermLevel>,
    /** Directory's metadata. */
    md: Record<string, string>
}

// Exports =============================================================================================================

export default class DirectoryTable {

    public static DIR_ITEM_COUNT    = 2
    public static DIR_NAME_LENGTH   = 2
    public static DIR_ADDRESS       = 8

    public static USER_PERM_COUNT   = 2
    public static USER_PERM_ID      = 4
    public static USER_PERM_LEVEL   = 1

    public static MD_FIELD_COUNT    = 1
    public static MD_KEY_LENGTH     = 1
    public static MD_VALUE_LENGTH   = 1

    /** 
        Type   | Description

        --------------------------------------------------------
        Int16  | Directory item count
        -------|------------------------------------------------
        Int16  | Item name byte-length
        String | Item name
        Int64  | Item address
        --------------------------------------------------------

        --------------------------------------------------------
        Int16  | User permissions item count
        -------|------------------------------------------------
        Int32  | User ID (parsed to a HEX code)
        Int8   | Permission level
        --------------------------------------------------------

        --------------------------------------------------------
        Int8   | Number of arbitrary folder metadata fields
        -------|------------------------------------------------
        Int8   | Key length
        String | Key
        Int8   | Value length
        String | Value
        --------------------------------------------------------
        
     */
    public static serializeDRTable(dir: TDirectory) {

        let bufSize = this.DIR_ITEM_COUNT + this.USER_PERM_COUNT + this.MD_FIELD_COUNT
        let childFields = 0
        let permFields  = 0
        let metaFields  = 0

        // Pass #1 (calculate buffer size) --------------------------

        // Directory items
        for (const key in dir.ch) {
            if (Object.prototype.hasOwnProperty.call(dir.ch, key)) {
                bufSize += this.DIR_NAME_LENGTH + Buffer.byteLength(key) + this.DIR_ADDRESS
                childFields++
            }
        }
        // User permissions
        for (const key in dir.usr) {
            if (Object.prototype.hasOwnProperty.call(dir.usr, key)) {
                bufSize += this.USER_PERM_ID + this.USER_PERM_LEVEL
                permFields++
            }
        }
        // Metadata
        for (const key in dir.md) {
            if (Object.prototype.hasOwnProperty.call(dir.md, key)) {
                const value = dir.md[key]!
                bufSize += this.MD_KEY_LENGTH + Buffer.byteLength(key) + this.MD_VALUE_LENGTH + Buffer.byteLength(value)                
                metaFields++
            }
        }

        // Pass #2 (write data) -------------------------------------

        const mem = Memory.allocUnsafe(bufSize)

        // Directory items
        mem.writeInt16(childFields)
        for (const key in dir.ch) {
            if (Object.prototype.hasOwnProperty.call(dir.ch, key)) {
                mem.writeInt16(Buffer.byteLength(key))
                mem.writeString(key)
                mem.writeInt64(dir.ch[key]!)
            }
        }
        // User permissions
        mem.writeInt16(permFields)
        for (const key in dir.usr) {
            if (Object.prototype.hasOwnProperty.call(dir.usr, key)) {
                mem.writeInt32(parseInt(key, 16))
                mem.writeInt8(dir.usr[key]!)
            }
        }
        // Metadata
        mem.writeInt8(metaFields)
        for (const key in dir.md) {
            if (Object.prototype.hasOwnProperty.call(dir.md, key)) {
                const value = dir.md[key]!
                mem.writeInt8(Buffer.byteLength(key))
                mem.writeString(key)
                mem.writeInt8(Buffer.byteLength(value))
                mem.writeString(value)
            }
        }

        return mem.buffer

    }

    public static deserializeDRTable(buf: Buffer) {

        const mem = Memory.wrap(buf)
        const dir: TDirectory = { ch: {}, usr: {}, md: {} }

        let childFields = mem.readInt16()
        for (let i = 0; i < childFields; i++) {
            const nameLength = mem.readInt16()
            const name       = mem.readString(nameLength)
            const address    = mem.readInt64()
            dir.ch[name]     = address
        }

        let permFields = mem.readInt16()
        for (let i = 0; i < permFields; i++) {
            const id    = mem.readInt32().toString(16).padStart(6, '0')
            const perm  = mem.readInt8()
            dir.usr[id] = perm as TPermLevel
        }

        let metaFields = mem.readInt8()
        for (let i = 0; i < metaFields; i++) {
            const keyLength   = mem.readInt8()
            const key         = mem.readString(keyLength)
            const valueLength = mem.readInt8()
            const value       = mem.readString(valueLength)
            dir.md[key]       = value
        }

        return dir

    }

}