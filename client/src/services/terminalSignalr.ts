import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

/**
 * SignalR connection for terminal operations.
 */
export const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.terminalHub)
    .withAutomaticReconnect()
    .withHubProtocol(new signalR.JsonHubProtocol())
    .build()

/**
 * Ensure the terminal connection is established.
 */
export async function ensureTerminalConnection(): Promise<void> {
    if (terminalConnection.state === signalR.HubConnectionState.Disconnected) {
        await terminalConnection.start()
    }
}