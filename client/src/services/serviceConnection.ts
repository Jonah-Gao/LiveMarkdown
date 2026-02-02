import * as signalR from "@microsoft/signalr";
import {HubConnection} from "@microsoft/signalr";

/**
 * Ensure the file service connection is established.
 */
export async function ensureServiceConnection(connection: HubConnection, connectionPromise: Promise<void> | null): Promise<void> {
    // If already connected, we're done
    if (connection.state === signalR.HubConnectionState.Connected) {
        return
    }

    // If a connection attempt is already in progress, wait for it
    if (connectionPromise) {
        await connectionPromise
        return
    }

    // If disconnected, start the connection
    if (connection.state === signalR.HubConnectionState.Disconnected) {
        connectionPromise = connection.start().finally(() => {
            connectionPromise = null
        })
        await connectionPromise
        return
    }

    // If connecting or reconnecting, wait for it to complete
    if (connection.state === signalR.HubConnectionState.Connecting ||
        connection.state === signalR.HubConnectionState.Reconnecting) {
        await new Promise<void>((resolve, reject) => {
            const onClosed = (error?: Error) => {
                reject(error || new Error('Connection closed while waiting'))
            }
            connection.onclose(onClosed)
            // Poll for connected state
            const checkState = () => {
                if (connection.state === signalR.HubConnectionState.Connected) {
                    connection.off('close', onClosed)
                    resolve()
                } else if (connection.state === signalR.HubConnectionState.Disconnected) {
                    connection.off('close', onClosed)
                    reject(new Error('Connection disconnected while waiting'))
                } else {
                    setTimeout(checkState, 50)
                }
            }
            checkState()
        })
    }
}