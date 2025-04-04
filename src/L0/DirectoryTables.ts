// Imports =============================================================================================================

import Memory from "./Memory.js"

// Types ===============================================================================================================

export interface TDirectoryTable {
    /** Defines directory read permissions for each user (cascading). */
    usr: Record<string,'none' | 'read' | 'write' | 'exec'>,
    /** Directory's children items. */
    ch: Record<string, number>,
    /** Directory's metadata. */
    md: Record<string, string>
}

// Exports =============================================================================================================

export default class DirectoryTables {

    public static DIRNAME_PREFIX_SIZE = 2     // Int16
    public static DIRNAME_MAX_SIZE    = 65536 // String
    public static UPERM_ID_SIZE       = 4     // Int32
    public static UPERM_VALUE_SIZE    = 1     // Int8

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
    public static serializeDRTable(dir: TDirectoryTable) {

        // Pass #1 (space count) --------------------------


    }

    public static deserializeDRTable(dir: Buffer) {

    }

}