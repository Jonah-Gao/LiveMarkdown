import * as signalR from '@microsoft/signalr'
import { useKernelStore } from '@/stores/kernel'

let kernelConnection: signalR.HubConnection | null = null
let kernelConnectionUrl: string | null = null
let connectionPromise: Promise<void> | null = null

/**
 * Get or create the SignalR connection for Python code execution.
 */
function getConnection(): signalR.HubConnection {
    const kernelStore = useKernelStore()
    const baseUrl = kernelStore.baseUrl

    if (!baseUrl) {
        throw new Error('Kernel not running - no port available')
    }

    const url = `${baseUrl}/kernelHub`

    if (!kernelConnection || kernelConnectionUrl !== url) {
        if (kernelConnection) {
            kernelConnection.stop()
        }
        console.log('Kernel Service Hub URL:', url)
        kernelConnection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build()
        kernelConnectionUrl = url
        connectionPromise = null
    }

    return kernelConnection
}

export { kernelConnection, getConnection as getKernelConnection }

export async function ensureKernelServiceConnection(): Promise<void> {
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

export async function createPythonVenvAsync(venvPath: string, pythonInterpreterPath: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await getConnection().invoke('CreateVenvAsync', venvPath, pythonInterpreterPath)
    } catch (err) {
        console.error('Python virtual environment creation failed:', err)
    }
}

export async function executePythonCodeAsync(terminalId: string, code: string, pythonInterpreterPath: string, venvPath: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await getConnection().invoke('ExecuteCodeAsync', terminalId, code, pythonInterpreterPath, venvPath)
    } catch (err) {
        console.error('Code execution failed:', err)
    }
}

export async function pythonInputAsync(terminalId: string, data: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await getConnection().invoke('PythonInput', terminalId, data)
    } catch (err) {
        console.error('Python input failed:', err)
    }
}