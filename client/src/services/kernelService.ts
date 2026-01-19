import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

/**
 * SignalR connection for Python code execution.
 */
export const kernelConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.kernelHub)
    .withAutomaticReconnect()
    .build()

export async function ensureKernelServiceConnection(): Promise<void> {
    if (kernelConnection.state === signalR.HubConnectionState.Disconnected) {
        await kernelConnection.start()
    }
}

export async function createPythonVenvAsync(venvPath: string,pythonInterpreterPath: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await kernelConnection.invoke('CreateVenvAsync', venvPath, pythonInterpreterPath)
    } catch (err) {
        console.error('Python virtual environment creation failed:', err)
    }
}

export async function executePythonCodeAsync(terminalId: string, code: string, pythonInterpreterPath: string, venvPath: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await kernelConnection.invoke('ExecuteCodeAsync', terminalId, code, pythonInterpreterPath, venvPath)
    } catch (err) {
        console.error('Code execution failed:', err)
    }
}

export async function pythonInputAsync(terminalId: string, data: string): Promise<void> {
    await ensureKernelServiceConnection()
    try {
        await kernelConnection.invoke('PythonInput', terminalId, data)
    } catch (err) {
        console.error('Python input failed:', err)
    }
}