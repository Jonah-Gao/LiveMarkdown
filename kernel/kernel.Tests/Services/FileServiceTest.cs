using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Channels;
using System.Threading.Tasks;
using kernel.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace kernel.Tests.Services;

public class FileServiceTests
{
    private static FileService CreateService() => new(NullLogger<FileService>.Instance);

    private static FileService.PanelLayout CreateLayout(string activeFile)
    {
        return new FileService.PanelLayout(
            ExplorerWidth: 240,
            TerminalHeight: 160,
            EditorPreviewRatio: 0.5,
            PreferredViewMode: FileService.ViewMode.Split,
            OpenedFiles: ["README.md", activeFile],
            ExpandedDirectories: ["docs", "src"],
            ActiveFile: activeFile,
            ExplorerVisible: false,
            SearchVisible: true,
            TerminalVisible: true,
            ActiveTopPanel: FileService.SidebarPanel.Search,
            ActiveBottomPanel: FileService.SidebarPanel.Terminal
        );
    }

    [Fact]
    public async Task StreamTabAsync_ReturnsMetadataThenContent()
    {
        using var tempDir = new TempDirectory();
        var filePath = Path.Combine(tempDir.Path, "sample.txt");
        await File.WriteAllTextAsync(filePath, "Hello", TestContext.Current.CancellationToken);
        var service = CreateService();

        var chunks = await TestHelpers.ToListAsync(service.StreamTabAsync(filePath, TestContext.Current.CancellationToken));

        Assert.True(chunks.Count >= 2);
        Assert.True(chunks[0].IsMetadata);
        var contentBuilder = new StringBuilder();
        for (var i = 1; i < chunks.Count; i++)
        {
            contentBuilder.Append(chunks[i].Content);
        }

        Assert.Equal("Hello", contentBuilder.ToString());
    }

    [Fact]
    public async Task StreamTabAsync_ReturnsErrorChunkWhenFileMissing()
    {
        using var tempDir = new TempDirectory();
        var filePath = Path.Combine(tempDir.Path, "missing.txt");
        var service = CreateService();

        var chunks = await TestHelpers.ToListAsync(service.StreamTabAsync(filePath, TestContext.Current.CancellationToken));

        Assert.True(chunks.Count >= 2);
        Assert.True(chunks[0].IsMetadata);
        Assert.True(chunks[1].IsError);
        Assert.False(string.IsNullOrWhiteSpace(chunks[1].Content));
    }

    [Fact]
    public async Task ReadDirAsync_ReturnsEntriesForExistingDirectory()
    {
        using var tempDir = new TempDirectory();
        var filePath = Path.Combine(tempDir.Path, "file.md");
        var subDir = Path.Combine(tempDir.Path, "nested");
        Directory.CreateDirectory(subDir);
        await File.WriteAllTextAsync(filePath, "data", TestContext.Current.CancellationToken);
        var service = CreateService();

        var nodes = await TestHelpers.ToListAsync(service.ReadDirAsync(tempDir.Path, TestContext.Current.CancellationToken));

        Assert.Contains(nodes, node => node.Path == filePath && !node.IsDirectory);
        Assert.Contains(nodes, node => node.Path == subDir && node.IsDirectory);
    }

    [Fact]
    public async Task ReadDirAsync_ReturnsEntriesFromNestedDirectory()
    {
        using var tempDir = new TempDirectory();
        var subDir = Path.Combine(tempDir.Path, "nested");
        Directory.CreateDirectory(subDir);
        var childFile = Path.Combine(subDir, "child.txt");
        await File.WriteAllTextAsync(childFile, "child", TestContext.Current.CancellationToken);
        var service = CreateService();

        var nodes = await TestHelpers.ToListAsync(service.ReadDirAsync(tempDir.Path, TestContext.Current.CancellationToken));

        Assert.Contains(nodes, node => node.Path == childFile && !node.IsDirectory);
    }

    [Fact]
    public void CreateDirectory_CreatesDirectory()
    {
        using var tempDir = new TempDirectory();
        var directoryPath = Path.Combine(tempDir.Path, "new-dir");
        var service = CreateService();

        service.CreateDirectory(directoryPath);

        Assert.True(Directory.Exists(directoryPath));
    }

    [Fact]
    public void CreateDirectory_HandlesWhitespacePath()
    {
        var service = CreateService();

        var exception = Record.Exception(() => service.CreateDirectory(" "));

        Assert.Null(exception);
    }

    [Fact]
    public void DeleteFile_RemovesExistingFile()
    {
        using var tempDir = new TempDirectory();
        var filePath = Path.Combine(tempDir.Path, "delete.txt");
        File.WriteAllText(filePath, "delete");
        var service = CreateService();

        service.DeleteFile(filePath);

        Assert.False(File.Exists(filePath));
    }

    [Fact]
    public async Task SaveFileAsync_OverwritesExistingFile()
    {
        using var tempDir = new TempDirectory();
        var filePath = Path.Combine(tempDir.Path, "save.txt");
        await File.WriteAllTextAsync(filePath, "old", TestContext.Current.CancellationToken);
        var service = CreateService();

        await service.SaveFileAsync(filePath, TestHelpers.CreateChannelReader("new"), ct: TestContext.Current.CancellationToken);

        Assert.Equal("new", await File.ReadAllTextAsync(filePath, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task SaveFileAsync_HandlesWhitespacePath()
    {
        var service = CreateService();

        var exception = await Record.ExceptionAsync(() =>
            service.SaveFileAsync(" ", TestHelpers.CreateChannelReader("data"), ct: TestContext.Current.CancellationToken));

        Assert.Null(exception);
    }

    [Fact]
    public async Task SaveWorkspaceSettingsAsync_WritesSettingsFile()
    {
        using var tempDir = new TempDirectory();
        var service = CreateService();
        var layout = CreateLayout("active.md");

        await service.SaveWorkspaceSettingsAsync(tempDir.Path, layout, TestContext.Current.CancellationToken);

        var settingsFile = Path.Combine(tempDir.Path, ".LiveMarkdown", "settings.json");
        Assert.True(File.Exists(settingsFile));
    }
}

internal sealed class TempDirectory : IDisposable
{
    public TempDirectory()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path);
    }

    public string Path { get; }

    public void Dispose()
    {
        if (Directory.Exists(Path))
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}

internal static class TestHelpers
{
    public static async Task<List<T>> ToListAsync<T>(IAsyncEnumerable<T> source)
    {
        var list = new List<T>();
        await foreach (var item in source)
        {
            list.Add(item);
        }

        return list;
    }

    public static ChannelReader<string> CreateChannelReader(params string[] chunks)
    {
        var channel = Channel.CreateUnbounded<string>();
        foreach (var chunk in chunks)
        {
            channel.Writer.TryWrite(chunk);
        }

        channel.Writer.TryComplete();
        return channel.Reader;
    }
}
