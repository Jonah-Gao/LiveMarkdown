namespace kernel.Hubs;

using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Collections.Concurrent;

public class TerminalHub(IHubContext<TerminalHub> hubContext) : Hub
{
    private readonly IHubContext<TerminalHub> _hubContext = hubContext;
    private static ConcurrentDictionary<string, Process> _sessions = new();
    private static ConcurrentDictionary<string, bool> _skipNextOutput = new();


    public override Task OnConnectedAsync()
    {
        var connectionId = Context.ConnectionId;

        var psi = new ProcessStartInfo("powershell.exe")
        {
            Arguments = "-NoLogo -NoExit",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };

        process.OutputDataReceived += async (_, e) =>
        {
            // Skip the first output line after a command (PowerShell prompt with command)
            if (_skipNextOutput.TryGetValue(connectionId, out var shouldSkip) && shouldSkip)
            {
                _skipNextOutput[connectionId] = false;
                return;
            }

            await _hubContext.Clients.Client(connectionId)
                .SendAsync("ReceiveOutput", e.Data);
        };

        process.ErrorDataReceived += async (_, e) =>
        {
            await _hubContext.Clients.Client(connectionId)
                .SendAsync("ReceiveOutput", e.Data);
        };

        process.Exited += async (_, _) =>
        {
            await _hubContext.Clients.Client(connectionId)
                .SendAsync("FinishedOutput", "\n[Session ended]");
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        _sessions[connectionId] = process;

        return base.OnConnectedAsync();
    }

    public Task SendCommand(string command)
    {
        if (_sessions.TryGetValue(Context.ConnectionId, out var process))
        {
            _skipNextOutput[Context.ConnectionId] = true;
            process.StandardInput.WriteLine(command);
            process.StandardInput.Flush();
        }

        return Task.CompletedTask;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (_sessions.TryRemove(Context.ConnectionId, out var process))
        {
            if (!process.HasExited)
                process.Kill();
            process.Dispose();
        }

        _skipNextOutput.TryRemove(Context.ConnectionId, out _);

        return base.OnDisconnectedAsync(exception);
    }
}