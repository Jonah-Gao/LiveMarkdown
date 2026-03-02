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

public class TerminalServiceTests
{
    private static TerminalService CreateService(out FakeHubContext<TerminalHub> hubContext)
    {
        hubContext = new FakeHubContext<TerminalHub>();
        return new TerminalService(NullLogger<TerminalService>.Instance, hubContext);
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
    public void Resize_UnknownTerminal_DoesNotThrow()
    {
        var service = CreateService(out _);
        var exception = Record.Exception(() => service.Resize("missing", 100, 50));
        Assert.Null(exception);
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
    public void KillTerminal_UnknownTerminal_DoesNotThrow()
    {
        var service = CreateService(out _);
        var exception = Record.Exception(() => service.KillTerminal("missing"));
        Assert.Null(exception);
    }

    [Fact]
    public void KillTerminal_WithTerminalAndCts_DisposesAndCancels()
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
    public void KillTerminal_WithOnlyTerminal_DisposesTerminal()
    {
        var service = CreateService(out _);
        var terminal = new FakePtyConnection();
        var terminals = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, IPtyConnection>>(service, "_terminals");
        terminals["t1"] = terminal;

        service.KillTerminal("t1");

        Assert.True(terminal.Disposed);
        Assert.False(terminals.ContainsKey("t1"));
    }

    [Fact]
    public void KillTerminal_WithOnlyCts_CancelsAndDisposesToken()
    {
        var service = CreateService(out _);
        var cts = new CancellationTokenSource();
        var ctsMap = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, CancellationTokenSource>>(service, "_cts");
        ctsMap["t1"] = cts;

        service.KillTerminal("t1");

        Assert.True(cts.IsCancellationRequested);
        Assert.False(ctsMap.ContainsKey("t1"));
    }

    [Fact]
    public void KillTerminal_WhenTerminalDisposeThrows_DoesNotThrow()
    {
        var service = CreateService(out _);
        var terminal = new FakePtyConnection { ThrowOnDispose = true };
        var terminals = ReflectionTestHelper.GetPrivateField<ConcurrentDictionary<string, IPtyConnection>>(service, "_terminals");
        terminals["t1"] = terminal;

        var exception = Record.Exception(() => service.KillTerminal("t1"));

        Assert.Null(exception);
    }

    [Fact]
    public async Task StartTerminalAsync_InvalidWorkingDirectory_Throws()
    {
        var service = CreateService(out _);
        var invalidPath = Path.Combine(Path.GetTempPath(), "kernel_missing_" + Guid.NewGuid().ToString("N"));

        var exception = await Record.ExceptionAsync(() =>
            service.StartTerminalAsync("t1", "conn1", "TerminalOutput", invalidPath));

        Assert.NotNull(exception);
    }
}
