import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'
import {FileNode, PanelLayout, TabChunk} from '@/types/workspace'

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
export async function saveWorkspaceSettingsAsync(cwd: string, layout: PanelLayout): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.invoke("SaveWorkspaceSettingsAsync", cwd, layout)
}

/**
 * Load workspace settings from disk.
 */
export async function loadLayoutAsync(dirPath: string): Promise<PanelLayout | null> {
    await ensureFileServiceConnection()
    return await fileServiceConnection.invoke<PanelLayout | null>("LoadWorkspaceSettingsAsync", dirPath)
}

export async function createDirectory(dirPath: string): Promise<void> {
    await ensureFileServiceConnection()
    await fileServiceConnection.invoke("CreateDirectory", dirPath)
}