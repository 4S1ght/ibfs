import fs from 'fs'
import path from 'path'
import url from 'url'

let _package: any

export default function semVer() {

    if (_package) return _package

    const dirname = path.dirname(url.fileURLToPath(import.meta.url))
    const resource = path.join(dirname, '../../package.json')
    const pack = JSON.parse(fs.readFileSync(resource, 'utf8'))

    const [major, minor, patch, tag] = pack.version.split(/\.|-/g)
    
    return _package = {
        major: Number(major),
        minor: Number(minor),
        patch: Number(patch),
        tag
    }
    
}