/**
 * Electron Main Process
 *
 * Handles application lifecycle, window management, and IPC communication.
 * Supports both development and production environments.
 */

import {app, BrowserWindow, Menu, ipcMain, shell} from 'electron'
import {fileURLToPath} from 'node:url'
import {spawn, ChildProcess} from 'child_process';
import path from 'node:path'
import Store from 'electron-store'
import windowStateKeeper from 'electron-window-state'
import {createSplashWindow, closeSplashWindow} from './splash'

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
let mainWindowState: ReturnType<typeof windowStateKeeper> | null = null
let shouldMaximize = false
let pendingClose = false
let allowClose = false
let kernelProcess: ChildProcess | null = null
let kernelPort: number | null = null

// =============================================================================
// Kernel Management
// =============================================================================

/**
 * Start the kernel process and monitor its lifecycle.
 */
function startKernel(): void {
    if (kernelProcess) {
        console.log('[Kernel] Already running')
        return
    }

    mainWindow?.webContents.send('kernel:status', 'starting')

    // In production, kernel is in resources/.kernel folder
    // In development, it's in the project's kernel folder
    const kernelDir = isDev
        ? path.join(APP_ROOT, 'kernel')
        : path.join(process.resourcesPath, '.kernel')
    const kernelPath = path.join(kernelDir, 'kernel.exe')

    console.log('[Kernel] Starting from:', kernelPath)

    kernelProcess = spawn(kernelPath, [], {stdio: 'pipe', cwd: kernelDir})

    const onData = (chunk: Buffer) => {
        const msg = chunk.toString()
        console.log('[Kernel stdout]', msg)
        const portMatch = msg.match(/SIGNALR_PORT=(\d+)/)
        if (portMatch) {
            kernelPort = parseInt(portMatch[1], 10)
            mainWindow?.webContents.send('kernel:port', kernelPort)
            mainWindow?.webContents.send('kernel:status', 'running')
            kernelProcess!.stdout?.off('data', onData)
        }

    }

    kernelProcess.stdout?.on('data', onData)

    kernelProcess.stderr?.on('data', (chunk) => {
        console.error('[Kernel stderr]', chunk.toString())
    })

    kernelProcess.on('error', (err) => {
        console.error('[Kernel] Process error:', err)
        mainWindow?.webContents.send('kernel:status', 'error', err.message)
        kernelProcess = null
        kernelPort = null
    })

    kernelProcess.on('exit', (code, signal) => {
        console.log(`[Kernel] Exited with code ${code}, signal ${signal}`)
        const wasRunning = kernelPort !== null
        kernelProcess = null
        kernelPort = null
        mainWindow?.webContents.send('kernel:status', 'stopped')

        // Auto-restart if it was running (unexpected exit)
        if (wasRunning && mainWindow && !mainWindow.isDestroyed()) {
            console.log('[Kernel] Unexpected exit, restarting...')
            setTimeout(() => startKernel(), 1000)
        }
    })
}

/**
 * Stop the kernel process.
 */
function stopKernel(): void {
    if (kernelProcess) {
        kernelProcess.kill()
        kernelProcess = null
        kernelPort = null
    }
}

// IPC handlers for kernel management
ipcMain.on('kernel:start', () => {
    startKernel()
})

ipcMain.on('kernel:stop', () => {
    stopKernel()
})

ipcMain.handle('kernel:get-port', () => {
    return kernelPort
})

ipcMain.handle('kernel:get-status', () => {
    if (kernelProcess) {
        return kernelPort ? 'running' : 'starting'
    }
    return 'stopped'
})

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

    // Restore window state
    mainWindowState = windowStateKeeper({
        defaultWidth: 1200,
        defaultHeight: 800,
    })
    shouldMaximize = mainWindowState.isMaximized

    mainWindow = new BrowserWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        minWidth: 800,
        minHeight: 600,
        title: 'LiveMarkdown',
        frame: false,
        icon: path.join(PUBLIC_PATH, 'favicon.ico'),
        show: false, // Don't show until app:ready
        backgroundColor: '#0d0d0d', // Prevent white flash
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    // Track window state changes (without auto-restoring maximize)
    mainWindow.on('resize', () => mainWindowState?.saveState(mainWindow!))
    mainWindow.on('move', () => mainWindowState?.saveState(mainWindow!))
    mainWindow.on('close', () => mainWindowState?.saveState(mainWindow!))

    // Send timestamp to renderer when loaded
    mainWindow.webContents.on('did-finish-load', () => {
        const timestamp = new Date().toLocaleString()
        mainWindow?.webContents.send('main-process-message', timestamp)
    })

    // Handle window maximize/unmaximize events
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('win:maximized', true)
        mainWindowState?.saveState(mainWindow!)
    })

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('win:maximized', false)
        mainWindowState?.saveState(mainWindow!)
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
        mainWindow.webContents.openDevTools({mode: 'detach'})
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

// Open external links in the system default browser.
ipcMain.on('open-external-url', async (_event, url) => {
    if (!/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
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
// IPC Handlers - Splash
// =============================================================================

/** Close splash and show main window when app is ready */
ipcMain.on('app:ready', () => {
    closeSplashWindow()
    if (mainWindow) {
        mainWindow.show()
        if (shouldMaximize) {
            mainWindow.maximize()
        }
    }
})

// =============================================================================
// Application Lifecycle
// =============================================================================

/**
 * Quit when all windows are closed.
 * Windows-only application - always quit when window is closed.
 */
app.on('window-all-closed', () => {
    stopKernel()
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

    // Show splash first
    createSplashWindow(__dirname, RENDERER_DIST, VITE_DEV_SERVER_URL)

    // Start kernel early
    startKernel()

    await createMainWindow()

    // Log startup info in development
    if (isDev) {
        console.log('[Electron] Main process started')
        console.log('[Electron] Dev server URL:', VITE_DEV_SERVER_URL)
    }
})

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
    console.error('[Electron] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled rejection:', reason)
})