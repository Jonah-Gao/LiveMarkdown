import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'
import {FileIndexEntry, FileNode, TabChunk} from '@/types/workspace'

export const fileServiceConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.fileHub)
    .withAutomaticReconnect()
    .build()

export async function ensureFileServiceConnection() {
    if (fileServiceConnection.state === signalR.HubConnectionState.Disconnected) {
        await fileServiceConnection.start()
    }
}

export async function quickScan(directoryPath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<FileNode>('QuickScanAsync', directoryPath, 1)
}

export async function streamTab(fileName: string, filePath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<TabChunk>('StreamTabAsync', fileName, filePath)
}

export async function deepIndex(rootPath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<FileIndexEntry>('DeepIndexAsync', rootPath)
}

export async function saveFile(path: string, content: string) {
    await ensureFileServiceConnection()
    await fileServiceConnection.invoke('SaveFile', path, content)
}
