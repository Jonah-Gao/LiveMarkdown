import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

export const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.terminalHub)
    .withAutomaticReconnect()
    .build()

export async function ensureTerminalConnection() {
    if (terminalConnection.state === signalR.HubConnectionState.Disconnected) {
        await terminalConnection.start()
    }
}