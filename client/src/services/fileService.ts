import * as signalR from '@microsoft/signalr'
import { useKernelStore } from '@/stores/kernel'
import {FileNode, WorkspaceSettingsDTO, TabChunk} from '@/types/workspace'

let fileServiceConnection: signalR.HubConnection | null = null
let fileServiceConnectionUrl: string | null = null
let connectionPromise: Promise<void> | null = null

/**
 * Get or create the SignalR connection for file service operations.
 */
function getConnection(): signalR.HubConnection {
    const kernelStore = useKernelStore()
    const baseUrl = kernelStore.baseUrl

    if (!baseUrl) {
        throw new Error('Kernel not running - no port available')
    }

    const url = `${baseUrl}/fileHub`

    if (!fileServiceConnection || fileServiceConnectionUrl !== url) {
        if (fileServiceConnection) {
            fileServiceConnection.stop()
        }
        console.log('File Service Hub URL:', url)
        fileServiceConnection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build()
        fileServiceConnectionUrl = url
        connectionPromise = null  // Reset promise when connection is recreated
    }

    return fileServiceConnection
}

export { fileServiceConnection }

/**
 * Ensure the file service connection is established.
 */
export async function ensureFileServiceConnection(): Promise<void> {
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
            // Poll for connected state
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
 * Read directory contents via streaming.
 */
export async function readDirectory(directoryPath: string) {
    await ensureFileServiceConnection()
    return getConnection().stream<FileNode>('ReadDirAsync', directoryPath)
}

/**
 * Stream file content for opening in a tab.
 */
export async function streamTab(filePath: string) {
    await ensureFileServiceConnection()
    return getConnection().stream<TabChunk>('StreamTabAsync', filePath)
}

/**
 * Save file content via streaming.
 * @param filePath The target file path
 * @param content The content to save
 * @param encoding The encoding to use when saving (default: utf-8)
 */
export async function saveTabAsync(filePath: string, content: string, encoding: string = 'utf-8'): Promise<void> {
    await ensureFileServiceConnection()

    const connection = getConnection()
    const subject = new signalR.Subject<string>()
    const chunkSize = 64 * 1024

    const task = connection.invoke("SaveFileAsync", filePath, subject, encoding)

    for (let offset = 0; offset < content.length; offset += chunkSize) {
        subject.next(content.slice(offset, offset + chunkSize))
    }

    subject.complete()
    try {
        await task
        console.log("SaveFileAsync complete")
    } catch (err) {
        console.error("SaveFileAsync error", err)
    }
}

/**
 * Save workspace settings to disk.
 */
export async function saveWorkspaceSettingsAsync(cwd: string, layout: WorkspaceSettingsDTO): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().invoke("SaveWorkspaceSettingsAsync", cwd, layout)
}

/**
 * Load workspace settings from disk.
 */
export async function loadLayoutAsync(dirPath: string): Promise<WorkspaceSettingsDTO | null> {
    await ensureFileServiceConnection()
    return await getConnection().invoke<WorkspaceSettingsDTO | null>("LoadWorkspaceSettingsAsync", dirPath)
}

export async function createDirectory(dirPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("CreateDirectory", dirPath)
}

export async function deleteDirectory(dirPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("DeleteDirectory", dirPath)
}

export async function moveDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("MoveDirectory", sourcePath, destPath)
}

export async function RenameDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("RenameDirectory", sourcePath, destPath)
}

export async function copyDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("CopyDirectory", sourcePath, destPath)
}

export async function createFile(filePath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("CreateFile", filePath)
}

export async function deleteFile(filePath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("DeleteFile", filePath)
}

export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("MoveFile", sourcePath, destPath)
}

export async function renameFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("RenameFile", sourcePath, destPath)
}

export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().send("CopyFile", sourcePath, destPath)
}

/**
 * Start watching a directory for file changes.
 */
export async function startWatching(directoryPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().invoke("StartWatchingAsync", directoryPath)
}

/**
 * Stop watching a directory for file changes.
 */
export async function stopWatching(directoryPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await getConnection().invoke("StopWatchingAsync", directoryPath)
}

/**
 * Register a callback for file change events.
 * @returns A function to unregister the callback.
 */
export function onFileChanged(callback: (dirPath: string) => void): () => void {
    const connection = getConnection()
    connection.on('DirectoryDirty', callback)
    return () => connection.off('DirectoryDirty', callback)
}