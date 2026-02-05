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
    /// Initialize a new terminal session for the connection.
    /// </summary>
    public async Task TerminalInit(string terminalId, string cwd)
    {
        var connectionId = Context.ConnectionId;
        logger.LogInformation("Initializing terminal for connection: {ConnectionId}",
            LogFormatter.ToCyan(connectionId));

        await terminalService.StartTerminalAsync(terminalId, connectionId, "TerminalOutput", cwd);
    }

    /// <summary>
    /// Send input to the terminal.
    /// </summary>
    public async Task TerminalInput(string terminalId, string data)
    {
        logger.LogDebug("Received terminal input: {Data}", LogFormatter.ToYellow(data));
        await terminalService.WriteInputAsync(terminalId, data);
    }

    /// <summary>
    /// Resize the terminal.
    /// </summary>
    public void TerminalResize(string terminalId, int cols, int rows)
    {
        terminalService.Resize(terminalId, cols, rows);
    }

    /// <summary>
    /// Clean up terminal session on disconnect.
    /// </summary>
    public void TerminalDisconnect(string terminalId)
    {
        terminalService.KillTerminal(terminalId);
    }
}