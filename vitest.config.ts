import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const dirname = path.dirname(url.fileURLToPath(import.meta.url))
fs.mkdirSync(path.join(dirname, './tests'), { recursive: true })

export default defineConfig({
    test: {
        exclude: [
            '**\/node_modules/**',
            '**\/dist/**', 
            '**\/cypress/**', 
            '**\/.{idea,git,cache,output,temp}/**', 
            '**\/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', 
            "./dist",
            "./old",
        ]
    }
})