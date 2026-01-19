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

export async function initializeTerminal(cwd: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await terminalConnection.invoke('TerminalInit', cwd)
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
}

export async function terminalInputAsync(data: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await terminalConnection.invoke('TerminalInput', data)
    } catch (err) {
        console.error('Terminal input failed:', err)
    }
}