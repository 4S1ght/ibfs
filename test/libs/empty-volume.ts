import Volume, { TVolumeInit } from '../../src/L0/Volume.js'
import * as rel from '../../src/misc/relatives.js'
import path from 'path'
import fs from 'fs'
import { uniformAsync } from './uniform.js'

const dirname = rel.dirname(import.meta.url)

interface Options extends Omit<TVolumeInit, 'fileLocation'> {
    filename: string
}

export async function emptyVolume(opt: Options) {

    const temp = path.join(dirname, '../temp')
    const file = path.join(temp, `${opt.filename}.ibfs`)

    fs.mkdirSync(temp, { recursive: true })
    if (fs.existsSync(file)) fs.rmSync(file)

    const error = await Volume.createEmptyVolume({ ...opt, fileLocation: file })
    if (error) throw error

    const volume = await uniformAsync(Volume.open(file))
    return volume

}