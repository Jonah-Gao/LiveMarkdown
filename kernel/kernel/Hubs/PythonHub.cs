using kernel.Services;
namespace kernel.Hubs;
using Microsoft.AspNetCore.SignalR;

public class PythonHub : Hub
{
    private readonly PythonVenvRunner _pythonService;
    private readonly ILogger<PythonHub> _logger;

    public PythonHub(PythonVenvRunner pythonService, ILogger<PythonHub> logger)
    {
        _pythonService = pythonService;
        _logger = logger;
    }
    
    public async Task ExecuteCodeAsync(string terminalId, string userCode, string systemPythonPath, string venvPath)
    {
        
        string connectionId = Context.ConnectionId;
        _logger.LogInformation("Initializing terminal for connection\n\tTerminal ID: {terminalId}\n\tConnection ID: {ConnectionId}", terminalId, connectionId);
        
        await _pythonService.ExecuteCodeAsync(connectionId, terminalId, userCode, systemPythonPath, venvPath);
    }
    
    public async Task PythonInput(string terminalId, string data)
    {
        _logger.LogInformation("Received terminal input: {Data}", data);
        await _pythonService.WriteInputAsync(terminalId, data);
    }
    
    public void TerminalResize(int cols, int rows)
    {
        _pythonService.Resize(Context.ConnectionId, cols, rows);
    }
    
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _pythonService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}