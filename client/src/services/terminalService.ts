import * as signalR from '@microsoft/signalr'
import { useKernelStore } from '@/stores/kernel'

let terminalConnection: signalR.HubConnection | null = null
let terminalConnectionUrl: string | null = null
let connectionPromise: Promise<void> | null = null

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
            terminalConnection.stop()
        }
        console.log('Terminal Service Hub URL:', url)
        terminalConnection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build()
        terminalConnectionUrl = url
        connectionPromise = null
    }

    return terminalConnection
}

export { terminalConnection, getConnection as getTerminalConnection }

/**
 * Ensure the terminal connection is established.
 */
export async function ensureTerminalConnection(): Promise<void> {
    const connection = getConnection()
    
    // If already connected, we're done
    if (connection.state === signalR.HubConnectionState.Connected) {
        return
    }
    
    // If a connection attempt is already in progress, wait for it
    if (connectionPromise) {
        await connectionPromise
        return
    }
    
    // If disconnected, start the connection
    if (connection.state === signalR.HubConnectionState.Disconnected) {
        connectionPromise = connection.start().finally(() => {
            connectionPromise = null
        })
        await connectionPromise
        return
    }
    
    // If connecting or reconnecting, wait for it to complete
    if (connection.state === signalR.HubConnectionState.Connecting ||
        connection.state === signalR.HubConnectionState.Reconnecting) {
        await new Promise<void>((resolve, reject) => {
            const onClosed = (error?: Error) => {
                reject(error || new Error('Connection closed while waiting'))
            }
            connection.onclose(onClosed)
            const checkState = () => {
                if (connection.state === signalR.HubConnectionState.Connected) {
                    connection.off('close', onClosed)
                    resolve()
                } else if (connection.state === signalR.HubConnectionState.Disconnected) {
                    connection.off('close', onClosed)
                    reject(new Error('Connection disconnected while waiting'))
                } else {
                    setTimeout(checkState, 50)
                }
            }
            checkState()
        })
    }
}

/**
 * Initialize a terminal session with a specific session ID.
 */
export async function initializeTerminal(terminalId: string, cwd: string): Promise<void> {
    await ensureTerminalConnection()
    try {
        await getConnection().invoke('TerminalInit', terminalId, cwd)
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
        await getConnection().invoke('TerminalInput', terminalId, data)
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
        await getConnection().invoke('TerminalDisconnect', terminalId)
    } catch (err) {
        console.error('Terminal close session failed:', err)
    }
}