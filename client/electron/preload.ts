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

    // You can expose other APTs you need here.
    // ...
})

contextBridge.exposeInMainWorld("fileAPI", {
    readDir: (dir: string) => ipcRenderer.invoke("read-dir", dir),
    createTab: (name: string, path: string) => ipcRenderer.invoke("create-tab", name, path),
});


contextBridge.exposeInMainWorld("nodePath", {
    join: (...args: string[]): string => path.join(...args),
    dirname: (p: string): string => path.dirname(p),
    basename: (p: string, ext?: string): string => path.basename(p, ext)
})

contextBridge.exposeInMainWorld("terminal", {
    input: (data: string) => ipcRenderer.send("terminal-input", data),
    onOutput: (callback: (data: string) => void) => ipcRenderer.on("terminal-output", (_event, data) => callback(data)),
})
