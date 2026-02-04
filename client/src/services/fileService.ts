import * as signalR from '@microsoft/signalr'
import {useKernelStore} from '@/stores/kernel'
import {ensureServiceConnection} from '@/services/serviceConnection.ts'
import {FileNode, WorkspaceSettingsDTO, TabChunk} from '@/types/workspace'

let fileServiceConnection: signalR.HubConnection | null = null
let fileServiceConnectionUrl: string | null = null

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
            fileServiceConnection.stop().then(() => {
            })
        }
        fileServiceConnection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build()
        fileServiceConnectionUrl = url
    }

    return fileServiceConnection
}

export {fileServiceConnection}

/**
 * Read directory contents via streaming.
 */
export async function readDirectory(directoryPath: string) {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    return connection.stream<FileNode>('ReadDirAsync', directoryPath)
}

/**
 * Stream file content for opening in a tab.
 */
export async function streamTab(filePath: string) {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    return connection.stream<TabChunk>('StreamTabAsync', filePath)
}

/**
 * Save file content via streaming.
 * @param filePath The target file path
 * @param content The content to save
 * @param encoding The encoding to use when saving (default: utf-8)
 */
export async function saveTabAsync(filePath: string, content: string, encoding: string = 'utf-8'): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)

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
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.invoke("SaveWorkspaceSettingsAsync", cwd, layout)
}

/**
 * Load workspace settings from disk.
 */
export async function loadLayoutAsync(dirPath: string): Promise<WorkspaceSettingsDTO | null> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    return await connection.invoke<WorkspaceSettingsDTO | null>("LoadWorkspaceSettingsAsync", dirPath)
}

export async function createDirectory(dirPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("CreateDirectory", dirPath)
}

export async function deleteDirectory(dirPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("DeleteDirectory", dirPath)
}

export async function moveDirectory(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("MoveDirectory", sourcePath, destPath)
}

export async function RenameDirectory(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("RenameDirectory", sourcePath, destPath)
}

export async function copyDirectory(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("CopyDirectory", sourcePath, destPath)
}

export async function createFile(filePath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("CreateFile", filePath)
}

export async function deleteFile(filePath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("DeleteFile", filePath)
}

export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("MoveFile", sourcePath, destPath)
}

export async function renameFile(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("RenameFile", sourcePath, destPath)
}

export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.send("CopyFile", sourcePath, destPath)
}

/**
 * Start watching a directory for file changes.
 */
export async function startWatching(directoryPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.invoke("StartWatchingAsync", directoryPath)
}

/**
 * Stop watching a directory for file changes.
 */
export async function stopWatching(directoryPath: string): Promise<void> {
    const connection = getConnection()
    await ensureServiceConnection(connection)
    await connection.invoke("StopWatchingAsync", directoryPath)
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