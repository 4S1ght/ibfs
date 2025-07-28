import crypto from 'crypto'

export default class UUID {

    /** 
     * Turns a string UUIDv4 into a Buffer easier to integrate into binary structures.
    */
    public static fromString(uuid: string) {
        const hex = uuid.replace(/-/g, '')
        const buf = Buffer.allocUnsafe(16)
        for (let i = 0; i < 16; i++) buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
        return buf
    }

    /**
     * Turns a binary UUIDv4 representation back to a string.
     */
    public static toString(buffer: Buffer) {
        const hex = [...buffer].map(b => b.toString(16).padStart(2, '0')).join('')
        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20)
        ].join('-')
    }

}