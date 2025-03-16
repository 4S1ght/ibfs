import Filesystem, { TFSInit } from '../../src/L1/Filesystem.js'
import * as rel from '../../src/misc/relatives.js'
import path from 'path'
import fs from 'fs'

const dirname = rel.dirname(import.meta.url)

interface Options extends Omit<TFSInit, 'fileLocation'> {
    filename: string
}

export function useEmptyFilesystem(opt: Options) {

    const temp = path.join(dirname, '../temp')
    const file = path.join(temp, `${opt.filename}.ibfs`)

    fs.mkdirSync(temp, { recursive: true })
    if (fs.existsSync(file)) fs.rmSync(file)

    const volume = Filesystem.createEmptyFilesystem({
        fileLocation: file,
        ...opt
    })

    return volume

}

export function getFilesystemPath(name: string) {
    const temp = path.join(dirname, '../temp')
    return path.join(temp, `${name}.ibfs`)
}