import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'
import {FileNode, TabChunk} from '@/types/workspace'

export const fileServiceConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.fileHub)
    .withAutomaticReconnect()
    .build()

export async function ensureFileServiceConnection() {
    if (fileServiceConnection.state === signalR.HubConnectionState.Disconnected) {
        await fileServiceConnection.start()
    }
}

export async function readDirectory(directoryPath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<FileNode>('ReadDirAsync', directoryPath)
}

export async function streamTab(fileName: string, filePath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<TabChunk>('StreamTabAsync', fileName, filePath)
}