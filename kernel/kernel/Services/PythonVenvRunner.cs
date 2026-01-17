using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using kernel.Hubs;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;
using Pty.Net;

namespace kernel.Services;

/// <summary>
/// Service for executing Python code in a virtual environment.
/// Responsibilities:
/// - Ensure a virtual environment exists (or create one)
/// - Write user code to a temporary script and run it using the venv python executable
/// - Stream stdout/stderr back to the caller via SignalR
/// - Track the spawned PTY so it can be resized, written to, or killed
/// </summary>
public class PythonVenvRunner(ILogger<PythonVenvRunner> logger, IHubContext<PythonHub> hubContext)
{
    private readonly ConcurrentDictionary<string, IPtyConnection> _terminals = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _cts = new();

    /// <summary>
    /// Ensure a virtual environment exists at the specified path.
    /// Creates one if it doesn't exist.
    /// </summary>
    public async Task CreateVenvAsync(string venvPath, string systemPythonPath)
    {
        // Check if venv already exists
        if (Directory.Exists(venvPath) && File.Exists(Path.Combine(venvPath, "pyvenv.cfg")))
        {
            logger.LogInformation("Virtual environment already exists at {VenvPath}", LogFormatter.ToGreen(venvPath));
            return;
        }

        logger.LogInformation("Creating virtual environment at {VenvPath} using system python: {SystemPython}",
            LogFormatter.ToGreen(venvPath), LogFormatter.ToYellow(systemPythonPath));

        var startInfo = new ProcessStartInfo
        {
            FileName = systemPythonPath,
            Arguments = $"-m venv \"{venvPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(startInfo);
        if (process == null)
        {
            logger.LogError("Failed to start process to create virtual environment.");
            throw new Exception("Failed to start process to create virtual environment.");
        }

        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            var error = await process.StandardError.ReadToEndAsync();
            logger.LogError("Failed to create virtual environment: {Error}", LogFormatter.ToBrightRed(error));
            throw new Exception($"Failed to create virtual environment: {error}");
        }

        logger.LogInformation("Virtual environment created successfully at {VenvPath}", LogFormatter.ToGreen(venvPath));
    }

    /// <summary>
    /// Execute Python code in a virtual environment.
    /// </summary>
    public async Task ExecuteCodeAsync(string connectionId, string terminalId, string userCode, string systemPythonPath,
        string venvPath)
    {
        KillTerminal(terminalId);

        await CreateVenvAsync(venvPath, systemPythonPath);
        var venvPythonExe = GetVenvPythonExecutable(venvPath);

        // Create temporary script file
        var tempScriptPath = Path.Combine(Path.GetTempPath(), $"kernel_script_{Guid.NewGuid()}.py");
        await File.WriteAllTextAsync(tempScriptPath, userCode, Encoding.UTF8);
        logger.LogInformation(
            "Executing Python code in terminal {TerminalId} (connection {ConnectionId}). Script: {ScriptPath}",
            LogFormatter.ToCyan(terminalId), LogFormatter.ToCyan(connectionId), LogFormatter.ToGreen(tempScriptPath));
        try
        {
            await RunProcessAsync(connectionId, terminalId, venvPythonExe, tempScriptPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error executing code for connection {ConnectionId}, terminal {TerminalId}",
                LogFormatter.ToBrightRed(connectionId), LogFormatter.ToBrightRed(terminalId));
            await hubContext.Clients.Client(connectionId).SendAsync("ReceiveResult", $"[Exception]: {ex.Message}");
        }
    }

    /// <summary>
    /// Get the path to the Python executable in the virtual environment.
    /// </summary>
    private static string GetVenvPythonExecutable(string venvPath)
    {
        // Windows and Unix venv layout differs
        var winPath = Path.Combine(venvPath, "Scripts", "python.exe");
        var unixPath = Path.Combine(venvPath, "bin", "python");

        return OperatingSystem.IsWindows() ? winPath : unixPath;
    }

    /// <summary>
    /// Run a Python script and stream output back to the client.
    /// </summary>
    private async Task RunProcessAsync(string connectionId, string terminalId, string venvPythonPath, string scriptPath)
    {
        logger.LogInformation("Spawning venv python: {PythonExe} {Script}",
            LogFormatter.ToYellow(venvPythonPath),
            LogFormatter.ToGreen(scriptPath));

        var options = new PtyOptions
        {
            App = venvPythonPath,
            Name = "xterm-color",
            Rows = 30,
            Cols = 80,
            CommandLine = [scriptPath],
            Cwd = Path.GetDirectoryName(scriptPath) ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Environment = new Dictionary<string, string>
            {
                { "PYTHONUNBUFFERED", "1" }
            }
        };

        using (logger.BeginScope(new Dictionary<string, object>
                   { ["TerminalId"] = terminalId, ["ConnectionId"] = connectionId }))
        {
            try
            {
                var terminal = await PtyProvider.SpawnAsync(options, CancellationToken.None);
                _terminals[terminalId] = terminal;
                var cts = new CancellationTokenSource();
                _cts[terminalId] = cts;

                logger.LogInformation("Spawned PTY for terminal {TerminalId}", LogFormatter.ToCyan(terminalId));

                // Start background task to read output
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
                            logger.LogDebug("[Python {TerminalId}] Output: {Output}",
                                LogFormatter.ToCyan(terminalId),
                                LogFormatter.ToGreen(output));
                            await hubContext.Clients.Client(connectionId)
                                .SendAsync("CodeOutput", terminalId, output, cancellationToken: cts.Token);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        logger.LogDebug("Read loop cancelled for terminal {TerminalId}",
                            LogFormatter.ToCyan(terminalId));
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Unexpected error reading PTY for terminal {TerminalId}",
                            LogFormatter.ToBrightRed(terminalId));
                    }
                    finally
                    {
                        logger.LogInformation("PTY read loop ending for terminal {TerminalId}, cleaning up",
                            LogFormatter.ToCyan(terminalId));

                        // Clean-up the temporary script file
                        if (File.Exists(scriptPath))
                        {
                            try
                            {
                                File.Delete(scriptPath);
                                logger.LogDebug("Deleted temporary script: {ScriptPath}",
                                    LogFormatter.ToGreen(scriptPath));
                            }
                            catch (Exception ex)
                            {
                                logger.LogWarning("Failed to delete temporary script {ScriptPath}: {Error}",
                                    LogFormatter.ToGreen(scriptPath), LogFormatter.ToBrightRed(ex.Message));
                            }
                        }

                        // Notify frontend that execution is finished
                        await hubContext.Clients.Client(connectionId)
                            .SendAsync("CodeExecutionCompleted", terminalId, cancellationToken: cts.Token);

                        if (_terminals.TryGetValue(terminalId, out var currentTerminal) && currentTerminal == terminal)
                        {
                            KillTerminal(terminalId);
                        }
                        else
                        {
                            // Not the owner (a new process took over), just dispose local resources
                            terminal.Dispose();
                            cts.Dispose();
                        }
                    }
                }, cts.Token);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to spawn PTY for terminal {TerminalId}",
                    LogFormatter.ToBrightRed(terminalId));
                throw;
            }
        }
    }

    /// <summary>
    /// Write input to a running Python process.
    /// </summary>
    public async Task WriteInputAsync(string terminalId, string input)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            logger.LogDebug("Writing input to python terminal {TerminalId}: {InputPreview}",
                LogFormatter.ToCyan(terminalId),
                LogFormatter.ToYellow(input.Length > 64 ? input[..64] + "..." : input));
            var data = Encoding.UTF8.GetBytes(input);
            await terminal.WriterStream.WriteAsync(data, 0, data.Length);
            await terminal.WriterStream.FlushAsync();
        }
    }

    /// <summary>
    /// Resize a Python terminal.
    /// </summary>
    public void Resize(string terminalId, int cols, int rows)
    {
        if (_terminals.TryGetValue(terminalId, out var terminal))
        {
            logger.LogInformation("Resizing python PTY {TerminalId} to {Cols}x{Rows}",
                LogFormatter.ToCyan(terminalId),
                LogFormatter.ToYellow(cols), LogFormatter.ToYellow(rows));
            terminal.Resize(cols, rows);
        }
    }

    /// <summary>
    /// Kill a Python terminal and clean up resources.
    /// </summary>
    public void KillTerminal(string terminalId)
    {
        if (_terminals.TryRemove(terminalId, out var terminal))
        {
            logger.LogInformation("Disposing python PTY {TerminalId}", LogFormatter.ToCyan(terminalId));
            terminal.Dispose();
        }

        if (_cts.TryRemove(terminalId, out var cts))
        {
            logger.LogInformation("Cancelling python PTY read loop for {TerminalId}", LogFormatter.ToCyan(terminalId));
            cts.Cancel();
            cts.Dispose();
        }
    }
}