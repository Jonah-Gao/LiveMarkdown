import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

/**
 * SignalR connection for Python code execution.
 */
export const kernelConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.kernelHub)
    .withAutomaticReconnect()
    .withHubProtocol(new signalR.JsonHubProtocol())
    .build()