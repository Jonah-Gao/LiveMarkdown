using kernel.Services;
using kernel.Utils;

namespace kernel.Hubs;

using Microsoft.AspNetCore.SignalR;

public class TerminalHub(TerminalService terminalService, ILogger<TerminalHub> logger) : Hub
{
    public async Task TerminalInit()
    {
        string connectionId = Context.ConnectionId;
        logger.LogInformation("Initializing terminal for connection: {ConnectionId}", LogFormatter.ToCyan(connectionId));

        await terminalService.StartTerminalAsync(connectionId, "TerminalOutput");
    }

    public async Task TerminalInput(string data)
    {
        // Log input at Debug level to avoid flooding logs with keystrokes
        logger.LogDebug("Received terminal input: {Data}", LogFormatter.ToYellow(data));
        await terminalService.WriteInputAsync(Context.ConnectionId, data);
    }

    public void TerminalResize(int cols, int rows)
    {
        terminalService.Resize(Context.ConnectionId, cols, rows);
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        terminalService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}