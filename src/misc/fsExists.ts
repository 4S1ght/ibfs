import fs from 'node:fs/promises'

export default async function(path: string) {
    try {
        await fs.stat(path)
        return true
    } 
    catch (error) {
        return false
    }
}