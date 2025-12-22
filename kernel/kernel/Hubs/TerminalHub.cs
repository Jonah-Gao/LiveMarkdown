using kernel.Services;
namespace kernel.Hubs;
using Microsoft.AspNetCore.SignalR;

public class TerminalHub : Hub
{
    private readonly TerminalService _terminalService;
    private readonly ILogger<TerminalHub> _logger;

    public TerminalHub(TerminalService terminalService, ILogger<TerminalHub> logger)
    {
        _terminalService = terminalService;
        _logger = logger;
    }
    
    public async Task TerminalInit()
    {
        
        string connectionId = Context.ConnectionId;
        _logger.LogInformation("Initializing terminal for connection: {ConnectionId}", connectionId);
        
        await _terminalService.StartTerminalAsync(connectionId, "TerminalOutput");
    }
    
    public async Task TerminalInput(string data)
    {
        _logger.LogInformation("Received terminal input: {Data}", data);
        await _terminalService.WriteInputAsync(Context.ConnectionId, data);
    }
    
    public void TerminalResize(int cols, int rows)
    {
        _terminalService.Resize(Context.ConnectionId, cols, rows);
    }
    
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _terminalService.KillTerminal(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}