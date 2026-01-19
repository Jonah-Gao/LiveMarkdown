/**
 * Vue Application Entry Point
 *
 * Initializes the Vue 3 application with Pinia state management
 * and sets up communication with the Electron main process.
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/style.css'
import 'material-symbols'
import App from './App.vue'

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Check if running in development mode.
 * Uses Vite's import.meta.env which is statically replaced at build time.
 */
const isDev = import.meta.env.DEV

/**
 * Check if running in Electron environment.
 * The ipcRenderer is only available when running in Electron.
 */
const isElectron = typeof window !== 'undefined' && !!window.ipcRenderer

// =============================================================================
// Application Initialization
// =============================================================================

/**
 * Create and configure the Vue application instance.
 */
function initializeApp() {
    const app = createApp(App)

    // Configure Pinia state management
    const pinia = createPinia()
    app.use(pinia)

    // Global error handler for Vue errors
    app.config.errorHandler = (error, instance, info) => {
        console.error('[Vue Error]', error)
        console.error('[Vue Error Info]', info)

        // In development, log additional debug information
        if (isDev) {
            console.error('[Vue Error Instance]', instance)
        }
    }

    // Global warning handler (development only)
    if (isDev) {
        app.config.warnHandler = (msg, _instance, trace) => {
            console.warn('[Vue Warning]', msg)
            if (trace) {
                console.warn('[Vue Warning Trace]', trace)
            }
        }
    }

    return app
}

/**
 * Set up IPC communication with Electron main process.
 */
function setupElectronIPC() {
    if (!isElectron) {
        if (isDev) {
            console.log('[App] Running in browser mode (no Electron IPC)')
        }
        return
    }

    // Listen for messages from the main process
    window.ipcRenderer.on('main-process-message', (_event, message) => {
        if (isDev) {
            console.log('[Electron] Main process message:', message)
        }
    })

    // Log startup information in development
    if (isDev) {
        console.log('[App] Running in Electron mode')
        console.log('[App] Development mode enabled')
    }
}

/**
 * Mount the application to the DOM.
 */
function mountApp(app: ReturnType<typeof createApp>) {
    const mountPoint = '#app'

    app.mount(mountPoint).$nextTick(() => {
        // Application is now mounted and ready
        setupElectronIPC()

        if (isDev) {
            console.log('[App] Application mounted successfully')
        }
    }).then(() => {})
}

// =============================================================================
// Bootstrap
// =============================================================================

const app = initializeApp()
mountApp(app)