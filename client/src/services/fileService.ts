import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'
import {FileNode, PanelLayout, TabChunk} from '@/types/workspace'

export const fileServiceConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.fileHub)
    .withAutomaticReconnect()
    .withHubProtocol(new signalR.JsonHubProtocol())
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

export async function streamTab(filePath: string) {
    await ensureFileServiceConnection()
    return fileServiceConnection.stream<TabChunk>('StreamTabAsync', filePath)
}

export async function saveTabAsync(filePath: string, content: string) {
    await ensureFileServiceConnection()

    const subject = new signalR.Subject<string>();
    const chunkSize = 64 * 1024;

    const task = fileServiceConnection.invoke("SaveFileAsync", filePath, subject);

    for (let offset = 0; offset < content.length; offset += chunkSize) {
        subject.next(content.slice(offset, offset + chunkSize));
    }

    subject.complete();
    try {
        await task;
        console.log("SaveFileAsync complete");
    } catch (err) {
        console.error("SaveFileAsync error", err);
    }
}

export async function saveWorkspaceSettingsAsync(cwd:string, layout: PanelLayout) {
    await ensureFileServiceConnection()
    const task = fileServiceConnection.invoke("SaveWorkspaceSettingsAsync", cwd, layout)
    await task;
}

export async function loadLayoutAsync(dirPath: string): Promise<PanelLayout | null> {
    await ensureFileServiceConnection()
    return await fileServiceConnection.invoke<PanelLayout | null>("LoadWorkspaceSettingsAsync", dirPath)
}