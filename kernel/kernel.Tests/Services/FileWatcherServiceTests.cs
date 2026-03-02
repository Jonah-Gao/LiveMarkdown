using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using kernel.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace kernel.Tests.Services;

public class FileWatcherServiceTests
{
    private static FileWatcherService CreateService() => new(NullLogger<FileWatcherService>.Instance);

    [Fact]
    public void StartWatching_WhitespacePath_ReturnsFalse()
    {
        using var service = CreateService();
        Assert.False(service.StartWatching(" "));
    }

    [Fact]
    public void StartWatching_MissingDirectory_ReturnsFalse()
    {
        using var service = CreateService();
        var path = Path.Combine(Path.GetTempPath(), "missing_" + Guid.NewGuid().ToString("N"));
        Assert.False(service.StartWatching(path));
    }

    [Fact]
    public void StartWatching_ExistingDirectory_ReturnsTrueAndIsWatching()
    {
        using var tempDir = new TempDirectory();
        using var service = CreateService();

        var started = service.StartWatching(tempDir.Path);

        Assert.True(started);
        Assert.True(service.IsWatching(tempDir.Path));
    }

    [Fact]
    public void StartWatching_SameDirectoryTwice_RequiresTwoStops()
    {
        using var tempDir = new TempDirectory();
        using var service = CreateService();
        Assert.True(service.StartWatching(tempDir.Path));
        Assert.True(service.StartWatching(tempDir.Path));

        service.StopWatching(tempDir.Path);
        Assert.True(service.IsWatching(tempDir.Path));

        service.StopWatching(tempDir.Path);
        Assert.False(service.IsWatching(tempDir.Path));
    }

    [Fact]
    public void StopWatching_UnknownDirectory_DoesNotThrow()
    {
        using var service = CreateService();
        var exception = Record.Exception(() => service.StopWatching(@"C:\definitely-not-watched"));
        Assert.Null(exception);
    }

    [Fact]
    public void Dispose_StopsAllWatchers()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService();
        Assert.True(service.StartWatching(tempDir.Path));

        service.Dispose();

        Assert.False(service.IsWatching(tempDir.Path));
    }

    [Fact]
    public void StartWatching_AfterDispose_ReturnsFalse()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService();
        service.Dispose();

        Assert.False(service.StartWatching(tempDir.Path));
    }

    [Fact]
    public async Task CreatedEvent_RaisesDirectoryDirtyForParent()
    {
        using var tempDir = new TempDirectory();
        using var service = CreateService();
        var events = new ConcurrentBag<(string Root, string Directory)>();
        service.DirectoryDirty += (root, dir) => events.Add((root, dir));
        Assert.True(service.StartWatching(tempDir.Path));
        var filePath = Path.Combine(tempDir.Path, "created.txt");

        await File.WriteAllTextAsync(filePath, "x", TestContext.Current.CancellationToken);

        var fired = await WaitUntilAsync(() => events.Any(e => e.Root == tempDir.Path && e.Directory == tempDir.Path));
        Assert.True(fired);
    }

    [Fact]
    public async Task DeletedEvent_RaisesDirectoryDirtyForParent()
    {
        using var tempDir = new TempDirectory();
        using var service = CreateService();
        var events = new ConcurrentBag<(string Root, string Directory)>();
        service.DirectoryDirty += (root, dir) => events.Add((root, dir));
        Assert.True(service.StartWatching(tempDir.Path));
        var filePath = Path.Combine(tempDir.Path, "deleted.txt");
        await File.WriteAllTextAsync(filePath, "x", TestContext.Current.CancellationToken);
        await Task.Delay(300, TestContext.Current.CancellationToken);

        File.Delete(filePath);

        var fired = await WaitUntilAsync(() => events.Any(e => e.Root == tempDir.Path && e.Directory == tempDir.Path));
        Assert.True(fired);
    }

    [Fact]
    public async Task RenamedAcrossDirectories_RaisesDirtyForOldAndNewParents()
    {
        using var tempDir = new TempDirectory();
        using var service = CreateService();
        var oldDir = Path.Combine(tempDir.Path, "old");
        var newDir = Path.Combine(tempDir.Path, "new");
        Directory.CreateDirectory(oldDir);
        Directory.CreateDirectory(newDir);
        var oldFile = Path.Combine(oldDir, "move.txt");
        var newFile = Path.Combine(newDir, "move.txt");
        await File.WriteAllTextAsync(oldFile, "x", TestContext.Current.CancellationToken);
        var events = new ConcurrentBag<(string Root, string Directory)>();
        service.DirectoryDirty += (root, dir) => events.Add((root, dir));
        Assert.True(service.StartWatching(tempDir.Path));
        await Task.Delay(300, TestContext.Current.CancellationToken);

        File.Move(oldFile, newFile);

        var fired = await WaitUntilAsync(() =>
            events.Any(e => e.Root == tempDir.Path && e.Directory == oldDir) &&
            events.Any(e => e.Root == tempDir.Path && e.Directory == newDir));
        Assert.True(fired);
    }

    private static async Task<bool> WaitUntilAsync(Func<bool> condition, int timeoutMs = 5000)
    {
        var start = Environment.TickCount64;
        while (Environment.TickCount64 - start < timeoutMs)
        {
            if (condition()) return true;
            await Task.Delay(50, TestContext.Current.CancellationToken);
        }

        return false;
    }
}
