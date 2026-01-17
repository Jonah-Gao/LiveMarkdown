using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

/// <summary>
/// SignalR hub for Python code execution.
/// Manages Python virtual environment and code execution sessions.
/// </summary>
public class PythonHub(PythonVenvRunner pythonService, ILogger<PythonHub> logger) : Hub
{
    /// <summary>
    /// Execute Python code in a virtual environment.
    /// </summary>
    public async Task ExecuteCodeAsync(string terminalId, string userCode, string systemPythonPath, string venvPath)
    {
        var connectionId = Context.ConnectionId;
        logger.LogInformation(
            "Initializing Python execution\n\tTerminal ID: {TerminalId}\n\tConnection ID: {ConnectionId}",
            LogFormatter.ToCyan(terminalId),
            LogFormatter.ToCyan(connectionId)
        );

        await pythonService.ExecuteCodeAsync(connectionId, terminalId, userCode, systemPythonPath, venvPath);
    }

    /// <summary>
    /// Send input to a running Python process.
    /// </summary>
    public async Task PythonInput(string terminalId, string data)
    {
        logger.LogDebug("Received Python input: {Data}", LogFormatter.ToYellow(data));
        await pythonService.WriteInputAsync(terminalId, data);
    }

    /// <summary>
    /// Resize the Python terminal.
    /// </summary>
    public void TerminalResize(int cols, int rows)
    {
        pythonService.Resize(Context.ConnectionId, cols, rows);
    }

    /// <summary>
    /// Clean up Python session on disconnect.
    /// </summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        pythonService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}