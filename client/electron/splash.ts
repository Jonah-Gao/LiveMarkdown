/**
 * Splash Window Module
 */

import { BrowserWindow } from 'electron'
import path from 'node:path'

let splashWindow: BrowserWindow | null = null

export function createSplashWindow(
    dirname: string,
    rendererDist: string,
    devServerUrl: string | undefined
): void {
    splashWindow = new BrowserWindow({
        width: 600,
        height: 338,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        show: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    splashWindow.center()

    if (devServerUrl) {
        splashWindow.loadURL(`${devServerUrl}splash.html`)
    } else {
        splashWindow.loadFile(path.join(rendererDist, 'splash.html'))
    }
}

export function closeSplashWindow(): void {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
    }
}
