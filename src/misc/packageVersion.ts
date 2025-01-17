import fs from 'fs'
import path from 'path'
import url from 'url'

export default function semVer() {

    const dirname = path.dirname(url.fileURLToPath(import.meta.url))
    const resource = path.join(dirname, '../../package.json')
    const pack = JSON.parse(fs.readFileSync(resource, 'utf8'))

    const [major, minor, patch, tag] = pack.version.split(/\.|-/g)
    return {
        major: Number(major),
        minor: Number(minor),
        patch: Number(patch),
        tag
    }
    
}