import {defineConfig} from 'vite'
import {fileURLToPath, URL} from 'node:url'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        },
    },
    server: {
        proxy: {
            '/mdHub': {
                target: 'http://localhost:5238',
                ws: true,          // 支持 WebSocket
                changeOrigin: true
            }
        }
    }
})
