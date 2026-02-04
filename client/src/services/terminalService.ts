import * as signalR from '@microsoft/signalr'
import { useKernelStore } from '@/stores/kernel'
import { ensureServiceConnection} from "@/services/serviceConnection.ts";

let terminalConnection: signalR.HubConnection | null = null
let terminalConnectionUrl: string | null = null

/**
 * Get or create the SignalR connection for terminal operations.
 */
function getConnection(): signalR.HubConnection {
    const kernelStore = useKernelStore()
    const baseUrl = kernelStore.baseUrl

    if (!baseUrl) {
        throw new Error('Kernel not running - no port available')
    }

    const url = `${baseUrl}/terminalHub`

    if (!terminalConnection || terminalConnectionUrl !== url) {
        if (terminalConnection) {
            terminalConnection.stop().then(() => {})
        }
        terminalConnection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build()
        terminalConnectionUrl = url
    }

    return terminalConnection
}

export { terminalConnection, getConnection as getTerminalConnection }

/**
 * Initialize a terminal session with a specific session ID.
 */
export async function initializeTerminal(terminalId: string, cwd: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    try {
        await connection.invoke('TerminalInit', terminalId, cwd)
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
}

/**
 * Send input to a terminal session.
 */
export async function terminalInputAsync(terminalId: string, data: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    try {
        await connection.invoke('TerminalInput', terminalId, data)
    } catch (err) {
        console.error('Terminal input failed:', err)
    }
}

/**
 * Close a terminal session.
 */
export async function closeTerminalSession(terminalId: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    try {
        await connection.invoke('TerminalDisconnect', terminalId)
    } catch (err) {
        console.error('Terminal close session failed:', err)
    }
}