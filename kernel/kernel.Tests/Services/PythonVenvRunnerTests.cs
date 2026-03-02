using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using kernel.Hubs;
using kernel.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Pty.Net;
using Xunit;

namespace kernel.Tests.Services;

public class PythonVenvRunnerTests
{
    private static PythonVenvRunner CreateService(out FakeHubContext<PythonHub> hubContext)
    {
        hubContext = new FakeHubContext<PythonHub>();
        return new PythonVenvRunner(NullLogger<PythonVenvRunner>.Instance, hubContext);
    }

    [Fact]
    public async Task CreateVenvAsync_WhenVenvExists_DoesNotThrow()
    {
        using var tempDir = new TempDirectory();
        var venvPath = Path.Combine(tempDir.Path, "venv");
        Directory.CreateDirectory(venvPath);
        await File.WriteAllTextAsync(Path.Combine(venvPath, "pyvenv.cfg"), "home = test", TestContext.Current.CancellationToken);
        var service = CreateService(out _);

        var exception = await Record.ExceptionAsync(() => service.CreateVenvAsync(venvPath, "python"));

        Assert.Null(exception);
    }

    [Fact]
    public async Task CreateVenvAsync_InvalidPythonPath_Throws()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService(out _);
        var venvPath = Path.Combine(tempDir.Path, "venv");

        await Assert.ThrowsAnyAsync<Exception>(() =>
            service.CreateVenvAsync(venvPath, @"Z:\missing\python.exe"));
    }

    [Fact]
    public async Task CreateVenvAsync_ProcessFailure_Throws()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService(out _);
        var venvPath = Path.Combine(tempDir.Path, "venv");

        await Assert.ThrowsAnyAsync<Exception>(() =>
            service.CreateVenvAsync(venvPath, "powershell.exe"));
    }

    [Fact]
    public async Task WriteInputAsync_UnknownTerminal_DoesNotThrow()
    {
        var service = CreateService(out _);
        var exception = await Record.ExceptionAsync(() => service.WriteInputAsync("missing", "abc"));
        Assert.Null(exception);
    }

    [Fact]
    public async Task WriteInputAsync_KnownTerminal_WritesBytesAndFlushes()
    {
        var service = CreateService(out _);
        var terminal = new FakePtyConnection { WriterStream = new TrackingStream() };
        var terminals = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, IPtyConnection>>(service, "_terminals");
        terminals["t1"] = terminal;

        await service.WriteInputAsync("t1", "hello");

        var writer = Assert.IsType<TrackingStream>(terminal.WriterStream);
        Assert.Equal("hello", Encoding.UTF8.GetString(writer.ToArray()));
        Assert.True(writer.FlushCalled);
    }

    [Fact]
    public void Resize_KnownTerminal_CallsResize()
    {
        var service = CreateService(out _);
        var terminal = new FakePtyConnection();
        var terminals = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, IPtyConnection>>(service, "_terminals");
        terminals["t1"] = terminal;

        service.Resize("t1", 120, 40);

        Assert.Equal(120, terminal.LastCols);
        Assert.Equal(40, terminal.LastRows);
    }

    [Fact]
    public void KillTerminal_WithEntries_DisposesAndCancels()
    {
        var service = CreateService(out _);
        var terminal = new FakePtyConnection();
        var cts = new CancellationTokenSource();
        var terminals = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, IPtyConnection>>(service, "_terminals");
        var ctsMap = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, CancellationTokenSource>>(service, "_cts");
        terminals["t1"] = terminal;
        ctsMap["t1"] = cts;

        service.KillTerminal("t1");

        Assert.True(terminal.Disposed);
        Assert.True(cts.IsCancellationRequested);
        Assert.False(terminals.ContainsKey("t1"));
        Assert.False(ctsMap.ContainsKey("t1"));
    }

    [Fact]
    public void KillTerminal_UnknownTerminal_DoesNotThrow()
    {
        var service = CreateService(out _);
        var exception = Record.Exception(() => service.KillTerminal("missing"));
        Assert.Null(exception);
    }

    [Fact]
    public async Task ExecuteCodeAsync_WhenSpawnFails_SendsReceiveResult()
    {
        using var tempDir = new TempDirectory();
        var venvPath = Path.Combine(tempDir.Path, "venv");
        Directory.CreateDirectory(venvPath);
        await File.WriteAllTextAsync(Path.Combine(venvPath, "pyvenv.cfg"), "home = test", TestContext.Current.CancellationToken);
        var service = CreateService(out var hubContext);

        await service.ExecuteCodeAsync("conn1", "t1", "print('hi')", "ignored-python", venvPath);

        var client = hubContext.ClientsImpl.GetClient("conn1");
        Assert.Contains(client.Invocations, i => i.Method == "ReceiveResult");
    }

    [Fact]
    public async Task ExecuteCodeAsync_WhenCreateVenvFails_Throws()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService(out var hubContext);
        var venvPath = Path.Combine(tempDir.Path, "venv");

        await Assert.ThrowsAnyAsync<Exception>(() =>
            service.ExecuteCodeAsync("conn1", "t1", "print('x')", @"Z:\missing\python.exe", venvPath));

        var client = hubContext.ClientsImpl.GetClient("conn1");
        Assert.DoesNotContain(client.Invocations, i => i.Method == "ReceiveResult");
    }
}
