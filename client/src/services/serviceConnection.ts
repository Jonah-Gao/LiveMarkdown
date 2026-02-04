import * as signalR from '@microsoft/signalr'
import {HubConnection} from '@microsoft/signalr'

/*
 * Ensure that the given SignalR HubConnection is connected.
 * If it is disconnected, it will start the connection.
 * If it is connecting or reconnecting, it will wait until connected.
 * Concurrent calls for the same connection will share the same start promise.
 */

const pending = new WeakMap<HubConnection, Promise<void>>()

export async function ensureServiceConnection(connection: HubConnection): Promise<void> {
    // already connected
    if (connection.state === signalR.HubConnectionState.Connected) {
        return
    }

    // wait if a start is in progress
    const existing = pending.get(connection)
    if (existing) {
        await existing
        return
    }

    // if disconnected, start and track
    if (connection.state === signalR.HubConnectionState.Disconnected) {
        const promise = connection.start().finally(() => {
            pending.delete(connection)
        })

        pending.set(connection, promise)
        await promise
        return
    }

    // connecting or reconnecting: wait until connected or fails
    await new Promise<void>((resolve, reject) => {
        const onClose = (err?: Error) => {
            cleanup()
            reject(err ?? new Error('Connection closed while waiting'))
        }

        const cleanup = () => {
            connection.off('close', onClose)
        }

        connection.onclose(onClose)

        const check = () => {
            if (connection.state === signalR.HubConnectionState.Connected) {
                cleanup()
                resolve()
            } else if (
                connection.state === signalR.HubConnectionState.Disconnected
            ) {
                cleanup()
                reject(
                    new Error('Connection disconnected while waiting')
                )
            } else {
                setTimeout(check, 50)
            }
        }

        check()
    })
}
