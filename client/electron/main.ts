import {app, BrowserWindow, ipcMain} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from "fs";
import * as pty from "@lydell/node-pty";
import os from "os";


// const require = createRequire(import.meta.url)
const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
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

let ptyProcess: pty.IPty | null;


// The built directory structure

//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

async function createWindow(): Promise<void> {

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path.join(process.env.VITE_PUBLIC ?? "", 'electron-vite.svg'),
    })
    // Test active push message to Renderer-process.

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })
    if (VITE_DEV_SERVER_URL) {

        await win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        // win.loadFile('dist/index.html')
        await win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
}
// Quit when all windows are closed, except on macOS. There, it's common

// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})
app.on('activate', async () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow()
    }
})

app.whenReady().then(createWindow)
