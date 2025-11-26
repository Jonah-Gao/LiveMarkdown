/// <reference types="vite-plugin-electron/electron-env" />

import {FileNode} from "../src/vite-env";

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
interface Window {
    ipcRenderer: import('electron').IpcRenderer
    fileAPI: {
        readDir: (dir: string) => Promise<FileNode[]>
    }
    nodePath: {
        join: (...args: string[]) => string
        dirname: (p: string) => string
        basename: (p: string, ext?: string) => string
    }
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}
