import {defineConfig} from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

// The vite-plugin-monaco-editor package uses CommonJS default export
// but TypeScript/ESM import gets the module object. This handles both cases.
const monacoEditor = (monacoEditorPlugin as unknown as { default: typeof monacoEditorPlugin }).default || monacoEditorPlugin

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        monacoEditor({}),
        electron({
            main: {
                // Shortcut of `build.lib.entry`.
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['@lydell/node-pty'],
                        },
                    },
                },
            },
            preload: {
                // Shortcut of `build.rollupOptions.input`.
                // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
                input: path.join(__dirname, 'electron/preload.ts'),
                vite: {
                    build: {
                        rollupOptions: {
                            external: ["@lydell/node-pty"],
                            output: {
                                format: 'module', // Use moduleJS format
                                entryFileNames: 'preload.mjs', // Force filename to preload.mjs
                            }
                        }
                    }
                }
            },
            // Ployfill the Electron and Node.js API for Renderer process.
            // If you want to use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
            // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
            renderer: process.env.NODE_ENV === 'test'
                // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
                ? undefined
                : {},
        }),
    ],
    resolve: {
        alias: {
            "@markdown": path.resolve(__dirname, "src/lib/markdown"),
            "@": path.resolve(__dirname, "src"),
        },
    }

})