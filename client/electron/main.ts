/**
 * Electron Main Process
 *
 * Handles application lifecycle, window management, and IPC communication.
 * Supports both development and production environments.
 */

import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

// =============================================================================
// Environment & Path Configuration
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Application directory structure:
 * ├─ dist/              - Vite build output (renderer)
 * │  └── index.html
 * └─ dist-electron/     - Electron build output (main process)
 *    ├── main.js
 *    └── preload.mjs
 */
const APP_ROOT = path.join(__dirname, '..')
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

// Use bracket notation to avoid Vite's define plugin transformation
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

/** Whether the app is running in development mode */
const isDev = !!VITE_DEV_SERVER_URL

/** Path to public assets (varies between dev and prod) */
const PUBLIC_PATH = isDev ? path.join(APP_ROOT, 'public') : RENDERER_DIST

// Set environment variables for other modules
process.env.APP_ROOT = APP_ROOT
process.env.VITE_PUBLIC = PUBLIC_PATH

// =============================================================================
// Persistent Storage
// =============================================================================

interface StoreSchema {
    lastCwd?: string
    lastDisplayCwd?: string
}

const store = new Store<StoreSchema>({
    name: 'config',
    defaults: {
        lastCwd: undefined,
        lastDisplayCwd: undefined
    }
})

// =============================================================================
// Window State
// =============================================================================

let mainWindow: BrowserWindow | null = null
let pendingClose = false
let allowClose = false

// =============================================================================
// Window Management
// =============================================================================

/**
 * Create the main application window.
 * Handles both development (with dev server) and production (with built files) modes.
 */
async function createMainWindow(): Promise<void> {
    // Reset close state for new window
    pendingClose = false
    allowClose = false

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        icon: path.join(PUBLIC_PATH, 'electron-vite.svg'),
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        mainWindow?.maximize()
    })

    // Send timestamp to renderer when loaded
    mainWindow.webContents.on('did-finish-load', () => {
        const timestamp = new Date().toLocaleString()
        mainWindow?.webContents.send('main-process-message', timestamp)
    })

    // Handle window maximize/unmaximize events
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('win:maximized', true)
    })

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('win:maximized', false)
    })

    // Handle graceful close with save confirmation
    mainWindow.on('close', (event) => {
        if (allowClose) return

        event.preventDefault()

        if (pendingClose) return
        pendingClose = true

        // Notify renderer to save changes before closing
        mainWindow?.webContents.send('app:before-close')
    })

    // Load content based on environment
    if (isDev) {
        await mainWindow.loadURL(VITE_DEV_SERVER_URL!)
        // Open DevTools in development
        mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
        await mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
}

// =============================================================================
// IPC Handlers - Window Controls
// =============================================================================

/** Minimize the main window */
ipcMain.on('win:minimize', () => {
    mainWindow?.minimize()
})

/** Toggle maximize/restore state */
ipcMain.on('win:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})

/** Request window close (triggers save confirmation) */
ipcMain.on('win:close', () => {
    mainWindow?.close()
})

/** Confirm close after save completion */
ipcMain.on('win:can-close', () => {
    if (!mainWindow) return

    allowClose = true
    pendingClose = false
    mainWindow.close()
})

// =============================================================================
// IPC Handlers - Workspace
// =============================================================================

/** Get the last used workspace directory */
ipcMain.handle('cwd:get', () => {
    return store.get('lastCwd')
})

/** Save the current workspace directory */
ipcMain.on('cwd:set', (_, cwd: string) => {
    store.set('lastCwd', cwd)
})

ipcMain.handle('cwd:get-display', () => {
    return store.get('lastDisplayCwd')
})

ipcMain.on('cwd:set-display', (_, cwd: string) => {
    store.set('lastDisplayCwd', cwd)
})

// =============================================================================
// Application Lifecycle
// =============================================================================

/**
 * Quit when all windows are closed.
 * Windows-only application - always quit when window is closed.
 */
app.on('window-all-closed', () => {
    app.quit()
    mainWindow = null
})

/**
 * Initialize application when Electron is ready.
 */
app.whenReady().then(async () => {
    // Disable menu in production
    if (!isDev) {
        Menu.setApplicationMenu(null)
    }

    await createMainWindow()

    // Log startup info in development
    if (isDev) {
        console.log('[Electron] Main process started')
        console.log('[Electron] Dev server URL:', VITE_DEV_SERVER_URL)
    }
})

/**
 * Handle uncaught exceptions gracefully
 */
process.on('uncaughtException', (error) => {
    console.error('[Electron] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled rejection:', reason)
})