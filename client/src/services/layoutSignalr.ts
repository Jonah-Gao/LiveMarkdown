import * as signalR from '@microsoft/signalr'
import SIGNALR_CONFIG from '@/config/signalr.json'

export const layoutConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.layoutHub)
    .withAutomaticReconnect()
    .build()
