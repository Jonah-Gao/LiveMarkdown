/// <reference types="vite-plugin-electron/electron-env" />


declare namespace NodeJS {
    interface ProcessEnv {
        /**
         * The built directory structure
         *
         * ```tree
         * ├─┬─┬ dist
         * │ │ └── index.html
         * │ │
         * │ ├─┬ dist-electron
         * │ │ ├── main.js
         * │ │ └── preload.js
         * │
         * ```
         */
        APP_ROOT: string
        /** /dist/ or /public/ */
        VITE_PUBLIC: string
    }
}

// Used in Renderer process, expose in `preload.ts`
declare global {
    interface Window {
        ipcRenderer: import('electron').IpcRenderer
        nodePath: {
            join: (...args: string[]) => string
            dirname: (p: string) => string
            basename: (p: string, ext?: string) => string
            normalize: (p: string) => string
            normalizeDisplay: (p: string) => string
        }
        windowControls: {
            minimize(): void
            maximize(): void
            close(): void
            canClose(): void
            onMaximize(cb: (maximized: boolean) => void): void
            onBeforeClose(cb: () => void): void
        }
        cwd: {
            setCwd(cwd: string): void
            getCwd(): Promise<string>
        }
    }
}

declare module '*.vue' {
    import type {DefineComponent} from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}