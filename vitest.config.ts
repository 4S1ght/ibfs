import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: [
            'test/**/*.test.ts'
        ],
        // exclude: [
        //     '**\/node_modules/**',
        //     '**\/dist/**', 
        //     '**\/cypress/**', 
        //     '**\/.{idea,git,cache,output,temp}/**', 
        //     '**\/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', 
        //     "./dist",
        //     "./src/L1/*"
        // ]
    }
})