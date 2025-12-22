using kernel.Hubs;

namespace kernel.Services;

using System.Runtime.InteropServices;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using Pty.Net;

// TerminalService: manages pseudo-terminal (PTY) sessions for connected clients.
// Responsibilities:
// - Spawn terminal processes (powershell/bash) using PtyProvider
// - Relay output from the PTY to a SignalR client output route
// - Accept input and control commands (resize, kill)
// - Track active terminals and cancellation tokens per connection
public class TerminalService
{
    private readonly ConcurrentDictionary<string, IPtyConnection> _terminals = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _cts = new();
    private readonly ILogger<TerminalService> _logger;
    private readonly IHubContext<TerminalHub> _hubContext;

    public TerminalService(ILogger<TerminalService> logger, IHubContext<TerminalHub> hubContext)
    {
        _logger = logger;
        _hubContext = hubContext;
    }

    // StartTerminalAsync: Create and monitor a PTY connection for a client.
    // - connectionId: SignalR connection id to send output to
    // - outputRoute: the SignalR client method name to invoke with output
    // - commandLine: optional arguments passed to the shell executable
    public async Task StartTerminalAsync(string connectionId, string outputRoute, string[]? commandLine = null)
    {
        string shell = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "powershell.exe" : "bash";

        var options = new PtyOptions
        {
            App = shell,
            Name = "xterm-color",
            Rows = 30,
            Cols = 80,
            CommandLine = commandLine ?? [],
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Environment = new Dictionary<string, string>()
            {
                // Env Variables can be set here if needed
            }
        };

        // Log starting information with a structured scope so the connection id is included in all subsequent logs
        using (_logger.BeginScope(new Dictionary<string, object> { ["ConnectionId"] = connectionId }))
        {
            _logger.LogInformation("Starting terminal for connection {ConnectionId} (shell={Shell}, cwd={Cwd})",
                connectionId, shell, options.Cwd);

            try
            {
                IPtyConnection terminal = await PtyProvider.SpawnAsync(options, CancellationToken.None);
                _terminals.TryAdd(connectionId, terminal);
                var cts = new CancellationTokenSource();
                _cts.TryAdd(connectionId, cts);

                _ = Task.Run(async () =>
                {
                    var buffer = new byte[4096];
                    await using var stream = terminal.ReaderStream;
                    try
                    {
                        while (!cts.Token.IsCancellationRequested)
                        {
                            int bytesRead = await stream.ReadAsync(buffer, cts.Token);
                            if (bytesRead == 0) break;

                            string output = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                            // Include the connection id and output route in the log for easier filtering when diagnosing problems
                            _logger.LogInformation(
                                "[Terminal {ConnectionId}, Output Route {OutputRoute}] Output: {Output}",
                                connectionId, outputRoute, output);
                            await _hubContext.Clients.Client(connectionId)
                                .SendAsync(outputRoute, output, cancellationToken: cts.Token);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when cancellation is requested - log at debug-level to avoid noise
                        _logger.LogDebug("Read loop cancelled for connection {ConnectionId}", connectionId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Unexpected error reading from PTY for connection {ConnectionId}",
                            connectionId);
                    }
                    finally
                    {
                        // Ensure cleanup after the read loop exits
                        _logger.LogInformation(
                            "Terminal read loop ended for connection {ConnectionId}, performing cleanup", connectionId);
                        KillTerminal(connectionId);
                    }
                }, cts.Token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to spawn terminal for connection {ConnectionId}", connectionId);
                throw;
            }
        }
    }

    // Write input to a user's terminal.
    public async Task WriteInputAsync(string terminalId, string input)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            _logger.LogInformation("Writing input to terminal {TerminalId}: {InputPreview}", terminalId,
                input.Length > 64 ? input[..64] + "..." : input);
            byte[] data = Encoding.UTF8.GetBytes(input);
            await terminal.WriterStream.WriteAsync(data, 0, data.Length);
            await terminal.WriterStream.FlushAsync();
        }
        else
        {
            _logger.LogWarning("Attempted to write to unknown terminal {TerminalId}", terminalId);
        }
    }


    // Resize a terminal (columns x rows)
    public void Resize(string connectionId, int cols, int rows)
    {
        if (_terminals.TryGetValue(connectionId, out var terminal))
        {
            _logger.LogInformation("Resizing terminal {ConnectionId} to {Cols}x{Rows}", connectionId, cols, rows);
            terminal.Resize(cols, rows);
        }
        else
        {
            _logger.LogWarning("Resize requested for unknown terminal {ConnectionId}", connectionId);
        }
    }

    // KillTerminal: Dispose and remove the PTY and cancel the associated read loop.
    public void KillTerminal(string connectionId)
    {
        if (_terminals.TryRemove(connectionId, out var terminal))
        {
            _logger.LogInformation("Disposing terminal for connection {ConnectionId}", connectionId);
            terminal.Dispose();
        }

        if (_cts.TryRemove(connectionId, out var cts))
        {
            _logger.LogInformation("Cancelling read loop for connection {ConnectionId}", connectionId);
            cts.Cancel();
            cts.Dispose();
        }
    }
}