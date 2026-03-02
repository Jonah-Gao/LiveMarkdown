#nullable enable
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Pty.Net;
using Xunit;

namespace kernel.Tests.Services;

internal sealed class FakeHubContext<THub> : IHubContext<THub> where THub : Hub
{
    public FakeHubClients ClientsImpl { get; } = new();
    public IHubClients Clients => ClientsImpl;
    public IGroupManager Groups { get; } = new FakeGroupManager();
}

internal sealed class FakeHubClients : IHubClients
{
    private readonly ConcurrentDictionary<string, FakeClientProxy> _clients = new();
    private readonly FakeClientProxy _broadcastClient = new();

    public FakeClientProxy GetClient(string connectionId) => _clients.GetOrAdd(connectionId, _ => new FakeClientProxy());

    public IClientProxy All => _broadcastClient;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => _broadcastClient;
    public IClientProxy Client(string connectionId) => GetClient(connectionId);
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _broadcastClient;
    public IClientProxy Group(string groupName) => _broadcastClient;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => _broadcastClient;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => _broadcastClient;
    public IClientProxy User(string userId) => _broadcastClient;
    public IClientProxy Users(IReadOnlyList<string> userIds) => _broadcastClient;
}

internal sealed class FakeGroupManager : IGroupManager
{
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task RemoveFromGroupAsync(string connectionId, string groupName,
        CancellationToken cancellationToken = default) => Task.CompletedTask;
}

internal sealed class FakeClientProxy : IClientProxy
{
    public ConcurrentQueue<HubInvocation> Invocations { get; } = new();

    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Invocations.Enqueue(new HubInvocation(method, args, cancellationToken));
        return Task.CompletedTask;
    }
}

internal sealed record HubInvocation(string Method, object?[] Args, CancellationToken CancellationToken);

internal sealed class TrackingStream : MemoryStream
{
    public bool FlushCalled { get; private set; }

    public override void Flush()
    {
        FlushCalled = true;
        base.Flush();
    }

    public override Task FlushAsync(CancellationToken cancellationToken)
    {
        FlushCalled = true;
        return base.FlushAsync(cancellationToken);
    }
}

internal sealed class FakePtyConnection : IPtyConnection
{
    public Stream ReaderStream { get; set; } = new MemoryStream();
    public Stream WriterStream { get; init; } = new TrackingStream();
    public int Pid => 1234;
    public int ExitCode { get; private set; }
    public bool Disposed { get; private set; }
    public bool KillCalled { get; private set; }
    public int LastCols { get; private set; }
    public int LastRows { get; private set; }
    public bool ThrowOnDispose { get; init; }

    public event EventHandler<PtyExitedEventArgs>? ProcessExited;

    public bool WaitForExit(int timeout) => true;

    public void Kill()
    {
        KillCalled = true;
    }

    public void Resize(int cols, int rows)
    {
        LastCols = cols;
        LastRows = rows;
    }

    public void Dispose()
    {
        if (ThrowOnDispose)
        {
            throw new InvalidOperationException("dispose failure");
        }

        Disposed = true;
    }

}

internal static class ReflectionTestHelper
{
    public static TField GetPrivateField<TField>(object target, string fieldName)
    {
        var field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(field);
        return (TField)field.GetValue(target)!;
    }
}
