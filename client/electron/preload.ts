import {ipcRenderer, contextBridge} from 'electron'
import path from "node:path";

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },

    // You can expose other APIs you need here.
    // ...
})

contextBridge.exposeInMainWorld("nodePath", {
    join: (...args: string[]): string => path.join(...args),
    dirname: (p: string): string => path.dirname(p),
    basename: (p: string, ext?: string): string => path.basename(p, ext)
})

contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    canClose: () => ipcRenderer.send('win:can-close'),

    onMaximize: (cb: (maximized: boolean) => void) => {
        ipcRenderer.on('win:maximized', (_e, v) => cb(v))
    },
    onBeforeClose: (cb: () => void) => {
        ipcRenderer.on("app:before-close", cb)
    }
})

contextBridge.exposeInMainWorld("cwd", {
    setCwd: (cwd: string) => ipcRenderer.send("cwd:set", cwd),
    getCwd: () => ipcRenderer.invoke("cwd:get")
})
