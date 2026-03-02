/**
 * Vue Application Entry Point
 *
 * Initializes the Vue 3 application with Pinia state management
 * and sets up communication with the Electron main process.
 */

import {createApp} from 'vue'
import {createPinia} from 'pinia'
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
 * Intercept external link clicks and open them in the system browser.
 */
function setupExternalLinkHandler() {
    const nativeWindowOpen = window.open.bind(window)
    window.open = (url, target, features) => {
        const u = typeof url === 'string' ? url : String(url ?? '')
        if (/^https?:\/\//i.test(u) && isElectron && window.ipcRenderer) {
            window.ipcRenderer.send('open-external-url', u)
            return null
        }
        return nativeWindowOpen(url, target, features)
    }

    const normalizeExternalHref = (raw: any) => {
        if (!raw) return null
        let s = raw.trim()

        // If starts with "www.", prepend https://
        if (/^www\./i.test(s)) s = `https://${s}`

        // If looks like domain but missing protocol, prepend https://
        if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s)) {
            s = `https://${s}`
        }

        try {
            const u = new URL(s)
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
            return u.toString()
        } catch {
            return null
        }
    }

    const handleLinkEvent = (event: any) => {
        if (event.defaultPrevented) return
        if (event.type === 'click' && event.button !== 0) return
        if (event.type === 'auxclick' && event.button !== 1) return

        const target = event.target
        if (!(target instanceof Element)) return

        const anchor = target.closest('a[href]')
        if (!(anchor instanceof HTMLAnchorElement)) return

        const hrefAttr = anchor.getAttribute('href') || ''
        if (!hrefAttr || hrefAttr.startsWith('#')) return

        const external = normalizeExternalHref(hrefAttr)
        if (!external) return

        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation()
        }

        if (isElectron && window.ipcRenderer) {
            window.ipcRenderer.send('open-external-url', external)
        } else {
            nativeWindowOpen(external, '_blank', 'noopener,noreferrer')
        }
    }

    document.addEventListener('click', handleLinkEvent, true)
    document.addEventListener('auxclick', handleLinkEvent, true)
}

/**
 * Mount the application to the DOM.
 */
function mountApp(app: ReturnType<typeof createApp>) {
    const mountPoint = '#app'

    app.mount(mountPoint).$nextTick(() => {
        // Application is now mounted and ready
        setupElectronIPC()
        setupExternalLinkHandler()

        if (isDev) {
            console.log('[App] Application mounted successfully')
        }
    }).then(() => {
    })
}

// =============================================================================
// Bootstrap
// =============================================================================

const app = initializeApp()
mountApp(app)