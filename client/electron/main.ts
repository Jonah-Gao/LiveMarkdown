import {app, BrowserWindow, Menu} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ipcMain} from 'electron'
import Store from "electron-store"


const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<{
    lastCwd?: string
}>()

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
let pendingClose = false;
let allowClose = false;

async function createWindow(): Promise<void> {

    pendingClose = false;
    allowClose = false;

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        frame: false,
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

    win?.maximize()

    win?.on('maximize', () => {
        win?.webContents.send('win:maximized', true)
    })

    win?.on('unmaximize', () => {
        win?.webContents.send('win:maximized', false)
    })

    win?.on('close', (e) => {
        if (allowClose) return;
        e.preventDefault();
        if (pendingClose) return;
        pendingClose = true;
        win?.webContents.send('app:before-close');
    });
}


ipcMain.on('win:minimize', () => win?.minimize())

ipcMain.on('win:maximize', () => {
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
})

ipcMain.on('win:close', () => {
    if (!win) return;
    win.close();
})

ipcMain.on('win:can-close', () => {
    if (!win) return;
    allowClose = true;
    pendingClose = false;
    win.close();
});

ipcMain.handle("cwd:get", () => {
    return store.get("lastCwd")
})

ipcMain.on("cwd:set", (_, cwd: string) => {
    store.set("lastCwd", cwd)
})


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

app.whenReady().then(async () => {
    if (!VITE_DEV_SERVER_URL) {
        Menu.setApplicationMenu(null)
    }
    await createWindow()
})
