import Volume, { TVolumeInit } from '../../src/L0/Volume.js'
import * as rel from '../../src/misc/relatives.js'
import path from 'path'
import fs from 'fs'

const dirname = rel.dirname(import.meta.url)

interface Options extends Omit<TVolumeInit, 'fileLocation'> {
    filename: string
}

export function useEmptyVolume(opt: Options) {

    const temp = path.join(dirname, '../temp')
    const file = path.join(temp, `${opt.filename}.ibfs`)

    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true })
    fs.mkdirSync(temp)

    const volume = Volume.createEmptyVolume({
        ...opt,
        fileLocation: file
    })

    return volume

}

export function getVolumePath(name: string) {
    const temp = path.join(dirname, '../temp')
    return path.join(temp, `${name}.ibfs`)
}