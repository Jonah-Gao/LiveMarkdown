import * as signalR from '@microsoft/signalr'
import { useKernelStore } from '@/stores/kernel'
import { ensureServiceConnection} from "@/services/serviceConnection.ts";

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
            kernelConnection.stop().then(() => {})
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

export async function createPythonVenvAsync(venvPath: string, pythonInterpreterPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection, connectionPromise)
    try {
        await connection.invoke('CreateVenvAsync', venvPath, pythonInterpreterPath)
    } catch (err) {
        console.error('Python virtual environment creation failed:', err)
    }
}

export async function executePythonCodeAsync(terminalId: string, code: string, pythonInterpreterPath: string, venvPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection, connectionPromise)
    try {
        await connection.invoke('ExecuteCodeAsync', terminalId, code, pythonInterpreterPath, venvPath)
    } catch (err) {
        console.error('Code execution failed:', err)
    }
}

export async function pythonInputAsync(terminalId: string, data: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection, connectionPromise)
    try {
        await connection.invoke('PythonInput', terminalId, data)
    } catch (err) {
        console.error('Python input failed:', err)
    }
}