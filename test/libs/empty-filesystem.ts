import Filesystem, { TFSInit } from '../../src/L1/Filesystem.js'
import * as rel from '../../src/misc/relatives.js'
import path from 'path'
import fs from 'fs'
import { uniformAsync } from './uniform.js'

const dirname = rel.dirname(import.meta.url)

interface Options extends Omit<TFSInit, 'fileLocation'> {
    filename: string
}

export async function emptyFilesystem(opt: Options) {

    const temp = path.join(dirname, '../temp')
    const file = path.join(temp, `${opt.filename}.ibfs`)

    fs.mkdirSync(temp, { recursive: true })
    if (fs.existsSync(file)) fs.rmSync(file)

    const error = await Filesystem.createEmptyFilesystem({ ...opt, fileLocation: file })
    if (error) throw error

    const volume = await uniformAsync(Filesystem.open(file, opt.aesKey))
    return volume

}