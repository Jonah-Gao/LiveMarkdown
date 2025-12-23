using kernel.Services;
using kernel.Utils;

namespace kernel.Hubs;
using Microsoft.AspNetCore.SignalR;

public class PythonHub(PythonVenvRunner pythonService, ILogger<PythonHub> logger) : Hub
{
    public async Task ExecuteCodeAsync(string terminalId, string userCode, string systemPythonPath, string venvPath)
    {
        
        string connectionId = Context.ConnectionId;
        logger.LogInformation("Initializing terminal for connection\n\tTerminal ID: {terminalId}\n\tConnection ID: {ConnectionId}", LogFormatter.ToCyan(terminalId), LogFormatter.ToCyan(connectionId));
        
        await pythonService.ExecuteCodeAsync(connectionId, terminalId, userCode, systemPythonPath, venvPath);
    }
    
    public async Task PythonInput(string terminalId, string data)
    {
        // Log input at Debug level
        logger.LogDebug("Received terminal input: {Data}", LogFormatter.ToYellow(data));
        await pythonService.WriteInputAsync(terminalId, data);
    }
    
    public void TerminalResize(int cols, int rows)
    {
        pythonService.Resize(Context.ConnectionId, cols, rows);
    }
    
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        pythonService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}