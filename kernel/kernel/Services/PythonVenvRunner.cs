using kernel.Hubs;

namespace kernel.Services;

using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using Pty.Net;

// PythonVenvRunner: prepares a Python virtual environment (venv) and executes user code inside it.
// Responsibilities:
// - Ensure a virtual environment exists (or create one)
// - Write user code to a temporary script and run it using the venv python executable
// - Stream stdout/stderr back to the caller via SignalR
// - Track the spawned PTY so it can be resized, written to, or killed
public class PythonVenvRunner
{
    private readonly ILogger<PythonVenvRunner> _logger;
    private readonly ConcurrentDictionary<string, IPtyConnection> _terminals = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _cts = new();
    private readonly IHubContext<PythonHub> _hubContext;

    public PythonVenvRunner(ILogger<PythonVenvRunner> logger, IHubContext<PythonHub> hubContext)
    {
        _logger = logger;
        _hubContext = hubContext;
    }

    private async Task EnsureVenvExistsAsync(string venvPath, string systemPythonPath)
    {
        // Simple existence check: ensure venv directory and pyvenv.cfg exist.
        if (Directory.Exists(venvPath) && (File.Exists(Path.Combine(venvPath, "pyvenv.cfg"))))
        {
            _logger.LogInformation("Virtual environment already exists at {VenvPath}", venvPath);
            return;
        }

        _logger.LogInformation("Creating virtual environment at {VenvPath} using system python: {SystemPython}", venvPath, systemPythonPath);

        var startInfo = new ProcessStartInfo
        {
            FileName = systemPythonPath,
            Arguments = $"-m venv \"{venvPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using (var process = Process.Start(startInfo))
        {
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                string error = await process.StandardError.ReadToEndAsync();
                _logger.LogError("Failed to create virtual environment: {Error}", error);
                throw new Exception($"Failed to create virtual environment: {error}");
            }
        }

        _logger.LogInformation("Virtual environment created successfully at {VenvPath}", venvPath);
    }

    // Called by the frontend to execute code inside a venv.
    public async Task ExecuteCodeAsync(string connectionId, string terminalId, string userCode, string systemPythonPath,
        string venvPath)
    {
        await EnsureVenvExistsAsync(venvPath, systemPythonPath);
        string venvPythonExe = GetVenvPythonExecutable(venvPath);
        string tempScriptPath = Path.GetTempFileName() + ".py";
        await File.WriteAllTextAsync(tempScriptPath, userCode, Encoding.UTF8);
        _logger.LogInformation("Executing Python code in terminal {TerminalId} (connection {ConnectionId}). Script: {ScriptPath}", terminalId, connectionId, tempScriptPath);
        try
        {
            // Run the script and stream output back to the client
            await RunProcessAsync(connectionId, terminalId, venvPythonExe, tempScriptPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing code for connection {ConnectionId}, terminal {TerminalId}", connectionId, terminalId);
            await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveResult", $"[Exception]: {ex.Message}");
        }
        finally
        {
            // Attempt to delete the temporary script; ignore failures
            if (File.Exists(tempScriptPath))
            {
                try
                {
                    // File.Delete(tempScriptPath);
                }
                catch
                {
                    /* Ignore cleanup errors */
                }
            }
        }
    }

    private string GetVenvPythonExecutable(string venvPath)
    {
        // Windows and Unix venv layout differs
        string winPath = Path.Combine(venvPath, "Scripts", "python.exe");
        string unixPath = Path.Combine(venvPath, "bin", "python");

        return OperatingSystem.IsWindows() ? winPath : unixPath;
    }

    private async Task RunProcessAsync(string connectionId, string terminalId, string venvPythonPath, string scriptPath)
    {
        _logger.LogInformation("Spawning venv python: {PythonExe} {Script}", venvPythonPath, scriptPath);
        string shell = venvPythonPath;

        var options = new PtyOptions
        {
            App = shell,
            Name = "xterm-color",
            Rows = 30,
            Cols = 80,
            CommandLine = [scriptPath],
            Cwd = Path.GetDirectoryName(scriptPath) ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Environment = new Dictionary<string, string>()
            {
                { "PYTHONUNBUFFERED", "1" }
            }
        };

        // Use the terminalId as the key for both terminal and its cancellation token
        using (_logger.BeginScope(new Dictionary<string, object> { ["TerminalId"] = terminalId, ["ConnectionId"] = connectionId }))
        {
            try
            {
                IPtyConnection terminal = await PtyProvider.SpawnAsync(options, CancellationToken.None);
                _terminals.TryAdd(terminalId, terminal);
                var cts = new CancellationTokenSource();
                _cts.TryAdd(terminalId, cts);

                _logger.LogInformation("Spawned PTY for terminal {TerminalId}", terminalId);

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
                            _logger.LogInformation("[Python {TerminalId}] Output: {Output}", terminalId, output);
                            await _hubContext.Clients.Client(connectionId)
                                .SendAsync("CodeOutput", terminalId, output, cancellationToken: cts.Token);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        _logger.LogDebug("Read loop cancelled for terminal {TerminalId}", terminalId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Unexpected error reading PTY for terminal {TerminalId}", terminalId);
                    }
                    finally
                    {
                        _logger.LogInformation("PTY read loop ending for terminal {TerminalId}, cleaning up", terminalId);
                        KillTerminal(terminalId);
                    }
                }, cts.Token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to spawn PTY for terminal {TerminalId}", terminalId);
                throw;
            }
        }
    }

    public async Task WriteInputAsync(string terminalId, string input)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            _logger.LogInformation("Writing input to python terminal {TerminalId}: {InputPreview}", terminalId, input.Length > 64 ? input[..64] + "..." : input);
            byte[] data = Encoding.UTF8.GetBytes(input);
            await terminal.WriterStream.WriteAsync(data, 0, data.Length);
            await terminal.WriterStream.FlushAsync();
        }
    }

    public void Resize(string terminalId, int cols, int rows)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            _logger.LogInformation("Resizing python PTY {TerminalId} to {Cols}x{Rows}", terminalId, cols, rows);
            terminal.Resize(cols, rows);
        }
    }

    public void KillTerminal(string terminalId)
    {
        if (_terminals.TryRemove(terminalId, out var terminal))
        {
            _logger.LogInformation("Disposing python PTY {TerminalId}", terminalId);
            terminal.Dispose();
        }

        if (_cts.TryRemove(terminalId, out var cts))
        {
            _logger.LogInformation("Cancelling python PTY read loop for {TerminalId}", terminalId);
            cts.Cancel();
            cts.Dispose();
        }
    }
}