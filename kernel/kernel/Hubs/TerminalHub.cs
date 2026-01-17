using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

/// <summary>
/// SignalR hub for terminal operations.
/// Manages PTY terminal sessions for connected clients.
/// </summary>
public class TerminalHub(TerminalService terminalService, ILogger<TerminalHub> logger) : Hub
{
    /// <summary>
    /// Initialise a new terminal session for the connection.
    /// </summary>
    public async Task TerminalInit(string cwd)
    {
        var connectionId = Context.ConnectionId;
        logger.LogInformation("Initializing terminal for connection: {ConnectionId}", LogFormatter.ToCyan(connectionId));

        await terminalService.StartTerminalAsync(connectionId, "TerminalOutput", cwd);
    }

    /// <summary>
    /// Send input to the terminal.
    /// </summary>
    public async Task TerminalInput(string data)
    {
        logger.LogDebug("Received terminal input: {Data}", LogFormatter.ToYellow(data));
        await terminalService.WriteInputAsync(Context.ConnectionId, data);
    }

    /// <summary>
    /// Resize the terminal.
    /// </summary>
    public void TerminalResize(int cols, int rows)
    {
        terminalService.Resize(Context.ConnectionId, cols, rows);
    }

    /// <summary>
    /// Clean up terminal session on disconnect.
    /// </summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        terminalService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}