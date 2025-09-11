import Namespace, { TNSInit } from '../../src/L2/Namespace.js'
import * as rel from '../../src/misc/relatives.js'
import path from 'path'
import fs from 'fs'
import { uniformAsync } from './uniform.js'

const dirname = rel.dirname(import.meta.url)

interface Options extends Omit<TNSInit, 'fileLocation'> {
    filename: string
}

export async function emptyNamespace(opt: Options) {

    const temp = path.join(dirname, '../temp')
    const file = path.join(temp, `${opt.filename}.ibfs`)

    fs.mkdirSync(temp, { recursive: true })
    if (fs.existsSync(file)) fs.rmSync(file)

    const error = await Namespace.createEmptyNamespace({ ...opt, fileLocation: file })
    if (error) throw error

    const volume = await uniformAsync(Namespace.open(file, opt.aesKey))
    return volume

}