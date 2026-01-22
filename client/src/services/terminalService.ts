import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

/**
 * SignalR connection for terminal operations.
 */
export const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.terminalHub)
    .withAutomaticReconnect()
    .build()

/**
 * Ensure the terminal connection is established.
 */
export async function ensureTerminalConnection(): Promise<void> {
    if (terminalConnection.state === signalR.HubConnectionState.Disconnected) {
        await terminalConnection.start()
    }
}

/**
 * Initialize a terminal session with a specific session ID.
 */
export async function initializeTerminal(terminalId: string, cwd: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await terminalConnection.invoke('TerminalInit', terminalId, cwd)
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
}

/**
 * Send input to a terminal session.
 */
export async function terminalInputAsync(terminalId: string, data: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await terminalConnection.invoke('TerminalInput', terminalId, data)
    } catch (err) {
        console.error('Terminal input failed:', err)
    }
}

/**
 * Close a terminal session.
 */
export async function closeTerminalSession(terminalId: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await terminalConnection.invoke('TerminalDisconnect', terminalId)
    } catch (err) {
        console.error('Terminal close session failed:', err)
    }
}