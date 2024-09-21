import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

process.loadEnvFile()

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        exclude: [
            '**\/node_modules/**',
            '**\/dist/**', 
            '**\/cypress/**', 
            '**\/.{idea,git,cache,output,temp}/**', 
            '**\/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', 
            "./dist"
        ]
    }
})