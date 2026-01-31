import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'
import {FileNode, WorkspaceSettingsDTO, TabChunk} from '@/types/workspace'

/**
 * SignalR connection for file service operations.
 */
export const fileServiceConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.fileHub)
    .withAutomaticReconnect()
    .build()

/**
 * Ensure the file service connection is established.
 */
export async function ensureFileServiceConnection(): Promise<void> {
    if (fileServiceConnection.state === signalR.HubConnectionState.Disconnected) {
        await fileServiceConnection.start()
    }
}

/**
 * Read directory contents via streaming.
 */
export async function readDirectory(directoryPath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<FileNode>('ReadDirAsync', directoryPath)
}

/**
 * Stream file content for opening in a tab.
 */
export async function streamTab(filePath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<TabChunk>('StreamTabAsync', filePath)
}

/**
 * Save file content via streaming.
 */
export async function saveTabAsync(filePath: string, content: string): Promise<void> {
    await ensureFileServiceConnection()

    const subject = new signalR.Subject<string>()
    const chunkSize = 64 * 1024

    const task = fileServiceConnection.invoke("SaveFileAsync", filePath, subject)

    // Stream content in chunks
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
    await fileServiceConnection.invoke("SaveWorkspaceSettingsAsync", cwd, layout)
}

/**
 * Load workspace settings from disk.
 */
export async function loadLayoutAsync(dirPath: string): Promise<WorkspaceSettingsDTO | null> {
    await ensureFileServiceConnection()
    return await fileServiceConnection.invoke<WorkspaceSettingsDTO | null>("LoadWorkspaceSettingsAsync", dirPath)
}

export async function createDirectory(dirPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("CreateDirectory", dirPath)
}

export async function deleteDirectory(dirPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("DeleteDirectory", dirPath)
}

export async function moveDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("MoveDirectory", sourcePath, destPath)
}

export async function RenameDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("RenameDirectory", sourcePath, destPath)
}

export async function copyDirectory(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("CopyDirectory", sourcePath, destPath)
}

export async function createFile(filePath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("CreateFile", filePath)
}

export async function deleteFile(filePath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("DeleteFile", filePath)
}

export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("MoveFile", sourcePath, destPath)
}

export async function renameFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("RenameFile", sourcePath, destPath)
}

export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.send("CopyFile", sourcePath, destPath)
}

/**
 * Start watching a directory for file changes.
 * The client will receive FileChanged events for this directory.
 */
export async function startWatching(directoryPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.invoke("StartWatchingAsync", directoryPath)
}

/**
 * Stop watching a directory for file changes.
 */
export async function stopWatching(directoryPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.invoke("StopWatchingAsync", directoryPath)
}

/**
 * Register a callback for file change events.
 * @returns A function to unregister the callback.
 */
export function onFileChanged(callback: (dirPath: string) => void): () => void {
    fileServiceConnection.on('DirectoryDirty', callback)
    return () => fileServiceConnection.off('DirectoryDirty', callback)
}
