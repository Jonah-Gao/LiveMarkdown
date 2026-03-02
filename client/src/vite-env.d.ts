/// <reference types="vite/client" />

interface FileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children?: FileNode[]
    expanded?: boolean
}

interface Tab {
    id: string
    name: string
    path: string
    content: string
    isDirty: boolean
}

export interface IFileAPI {
    readDir: (dir: string) => Promise<FileNode[]>
    createTab: (name: string, path: string) => Promise<Tab>
}

export interface INodePathAPI {
    join: (...args: string[]) => string
    dirname: (p: string) => string
    basename: (p: string, ext?: string) => string
    normalize: (p: string) => string
    normalizeDisplay: (p: string) => string
}

export interface ITerminalAPI {
    init: () => void
    input: (data: string) => void
    onOutput: (callback: (data: string) => void) => void
}

declare global {
    interface Window {
        fileAPI: IFileAPI
        nodePath: INodePathAPI
        terminal: ITerminalAPI
        ipcRenderer: {
            on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
            send: (channel: string, ...args: any[]) => void
        }
        windowControls: {
            minimize(): void
            maximize(): void
            close(): void
            canClose(): void
            appReady(): void
            onMaximize(cb: (maximized: boolean) => void): void
            onBeforeClose(cb: () => void): void
        }
        cwd: {
            setCwd(cwd: string): void
            getCwd(): Promise<string>
            setDisplayCwd(cwd: string): void
            getDisplayCwd(): Promise<string>
        }
        kernel: {
            start(): void
            stop(): void
            getPort(): Promise<number | null>
            getStatus(): Promise<'starting' | 'running' | 'stopped' | 'error'>
            onPort(cb: (port: number) => void): void
            onStatus(cb: (status: string, error?: string) => void): void
        }
        require?: NodeRequire
    }
}

declare module "*.vue" {
    import { DefineComponent } from "vue";
    const component: DefineComponent<{}, {}, any>;
    export default component;
}