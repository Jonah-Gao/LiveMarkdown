using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using kernel.Hubs;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;
using Pty.Net;

namespace kernel.Services;

/// <summary>
/// Service for managing pseudo-terminal (PTY) sessions for connected clients.
/// Responsibilities:
/// - Spawn terminal processes (PowerShell/bash) using PtyProvider
/// - Relay output from the PTY to a SignalR client output route
/// - Accept input and control commands (resize, kill)
/// - Track active terminals and cancellation tokens per connection
/// </summary>
/// <remarks>
/// TODO: Fix auto-inserted newline when typing the first two characters after launching the terminal
/// </remarks>
public class TerminalService(ILogger<TerminalService> logger, IHubContext<TerminalHub> hubContext)
{
    private readonly ConcurrentDictionary<string, IPtyConnection> _terminals = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _cts = new();

    /// <summary>
    /// Start a terminal session for a client.
    /// </summary>
    /// <param name="connectionId">SignalR connection ID</param>
    /// <param name="outputRoute">SignalR client method name to invoke with output</param>
    /// <param name="cwd">Working directory for the terminal</param>
    /// <param name="commandLine">Optional arguments passed to the shell executable</param>
    public async Task StartTerminalAsync(string connectionId, string outputRoute, string cwd,
        string[]? commandLine = null)
    {
        var shell = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "powershell.exe" : "bash";

        var options = new PtyOptions
        {
            App = shell,
            Name = "xterm-color",
            Rows = 50,
            Cols = 80,
            CommandLine = commandLine ?? [],
            Cwd = cwd,
            Environment = new Dictionary<string, string>()
        };

        using (logger.BeginScope(new Dictionary<string, object> { ["ConnectionId"] = connectionId }))
        {
            logger.LogInformation("Starting terminal for connection {ConnectionId} (shell={Shell}, cwd={Cwd})",
                LogFormatter.ToCyan(connectionId), LogFormatter.ToYellow(shell), LogFormatter.ToGreen(options.Cwd));

            try
            {
                var terminal = await PtyProvider.SpawnAsync(options, CancellationToken.None);
                _terminals.TryAdd(connectionId, terminal);
                var cts = new CancellationTokenSource();
                _cts.TryAdd(connectionId, cts);

                // Start background task to read terminal output and relay to client
                _ = Task.Run(async () =>
                {
                    var buffer = new byte[4096];
                    await using var stream = terminal.ReaderStream;
                    try
                    {
                        while (!cts.Token.IsCancellationRequested)
                        {
                            var bytesRead = await stream.ReadAsync(buffer, cts.Token);
                            if (bytesRead == 0) break;

                            var output = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                            logger.LogDebug(
                                "[Terminal {ConnectionId}, Output Route {OutputRoute}] Output: {Output}",
                                LogFormatter.ToCyan(connectionId), LogFormatter.ToMagenta(outputRoute),
                                LogFormatter.ToGreen(output));
                            await hubContext.Clients.Client(connectionId)
                                .SendAsync(outputRoute, output, cancellationToken: cts.Token);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        logger.LogDebug("Read loop cancelled for connection {ConnectionId}",
                            LogFormatter.ToCyan(connectionId));
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Unexpected error reading from PTY for connection {ConnectionId}",
                            LogFormatter.ToBrightRed(connectionId));
                    }
                    finally
                    {
                        logger.LogInformation(
                            "Terminal read loop ended for connection {ConnectionId}, performing cleanup",
                            LogFormatter.ToCyan(connectionId));
                        KillTerminal(connectionId);
                    }
                }, cts.Token);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to spawn terminal for connection {ConnectionId}",
                    LogFormatter.ToBrightRed(connectionId));
                throw;
            }
        }
    }

    /// <summary>
    /// Write input to a terminal.
    /// </summary>
    public async Task WriteInputAsync(string terminalId, string input)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            logger.LogDebug("Writing input to terminal {TerminalId}: {InputPreview}",
                LogFormatter.ToCyan(terminalId),
                LogFormatter.ToYellow(input.Length > 32 ? input[..32] + "..." : input));
            var data = Encoding.UTF8.GetBytes(input);
            await terminal.WriterStream.WriteAsync(data);
            await terminal.WriterStream.FlushAsync();
        }
        else
        {
            logger.LogWarning("Attempted to write to unknown terminal {TerminalId}",
                LogFormatter.ToBrightRed(terminalId));
        }
    }

    /// <summary>
    /// Resize a terminal (columns x rows).
    /// </summary>
    public void Resize(string connectionId, int cols, int rows)
    {
        if (_terminals.TryGetValue(connectionId, out var terminal))
        {
            logger.LogInformation("Resizing terminal {ConnectionId} to {Cols}x{Rows}",
                LogFormatter.ToCyan(connectionId), LogFormatter.ToYellow(cols), LogFormatter.ToYellow(rows));
            terminal.Resize(cols, rows);
        }
        else
        {
            logger.LogWarning("Resize requested for unknown terminal {ConnectionId}",
                LogFormatter.ToBrightRed(connectionId));
        }
    }

    /// <summary>
    /// Kill a terminal and clean up resources.
    /// </summary>
    public void KillTerminal(string connectionId)
    {
        if (_terminals.TryRemove(connectionId, out var terminal))
        {
            logger.LogInformation("Disposing terminal for connection {ConnectionId}",
                LogFormatter.ToCyan(connectionId));
            terminal.Dispose();
        }

        if (_cts.TryRemove(connectionId, out var cts))
        {
            logger.LogInformation("Cancelling read loop for connection {ConnectionId}",
                LogFormatter.ToCyan(connectionId));
            cts.Cancel();
            cts.Dispose();
        }
    }
}