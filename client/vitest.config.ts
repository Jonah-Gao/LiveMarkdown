import {defineConfig} from 'vitest/config'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: 'jsdom',
    },
    resolve: {
        alias: {
            "@markdown": path.resolve(__dirname, "src/lib/markdown"),
            "@": path.resolve(__dirname, "src"),
        },
    }
})
