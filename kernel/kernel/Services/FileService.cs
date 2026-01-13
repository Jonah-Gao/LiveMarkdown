using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using JetBrains.Annotations;
using kernel.Utils;

namespace kernel.Services;

// TODO: Directory watching to auto-refresh file tree and open tabs on changes
// TODO: Indexing the directory in a background task for faster access
// TODO: file operations: create, delete, rename, move, copy
public class FileService(ILogger<FileService> logger)
{
    public record FileIndexEntry(
        string Name,
        string Path,
        string Extension,
        bool IsDirectory,
        string? ParentPath,
        int Depth);

    public class FileNode
    {
        [UsedImplicitly] public string Name { get; set; } = string.Empty;
        [UsedImplicitly] public string Path { get; set; } = string.Empty;
        [UsedImplicitly] public string Extension { get; set; } = string.Empty;
        [UsedImplicitly] public bool IsDirectory { get; set; }
        [UsedImplicitly] public IAsyncEnumerable<FileNode>? Children { get; set; }
        [UsedImplicitly] public bool? Expanded { get; set; }
    }

    public class TabChunk
    {
        [UsedImplicitly] public string Id { get; set; } = string.Empty;
        [UsedImplicitly] public string Name { get; set; } = string.Empty;
        [UsedImplicitly] public string Path { get; set; } = string.Empty;
        [UsedImplicitly] public string Content { get; set; } = string.Empty;
        [UsedImplicitly] public bool IsMetadata { get; set; }
        [UsedImplicitly] public bool IsError { get; set; }
    }

    private readonly ConcurrentDictionary<string, FileIndexEntry> _fileIndex =
        new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyCollection<FileIndexEntry> SnapshotIndex() => _fileIndex.Values.ToArray();

    public async IAsyncEnumerable<TabChunk> StreamTabAsync(string fileName, string filePath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        var tabId = Guid.NewGuid().ToString();

        // 1. 先返回 Tab 元数据
        yield return new TabChunk
        {
            Id = tabId,
            Name = fileName,
            Path = filePath,
            IsMetadata = true, // 标识这是元数据
            Content = ""
        };

        await foreach (var chunk in StreamFileContentAsync(tabId, filePath, token))
        {
            yield return chunk;
        }
    }

    private async IAsyncEnumerable<TabChunk> StreamFileContentAsync(string tabId, string filePath,
        [EnumeratorCancellation] CancellationToken token)
    {
        TabChunk? errorTabChunk = null;
        StreamReader? reader = null;
        try
        {
            reader = File.OpenText(filePath);
        }
        catch (UnauthorizedAccessException ex)
        {
            logger.LogError(ex, "Access denied: {FilePath}", LogFormatter.ToBrightRed(filePath));
            errorTabChunk = ErrorTabChunk(tabId, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Cannot open file: {FilePath}", LogFormatter.ToBrightRed(filePath));
            errorTabChunk = ErrorTabChunk(tabId, ex.Message);
        }

        if (errorTabChunk != null)
        {
            yield return errorTabChunk;
            yield break;
        }

        using (reader)
        {
            const int chunkSize = 4096; // 4KB per chunk
            var buffer = new char[chunkSize];
            using var stream = File.OpenText(filePath);
            int charsRead;
            while ((charsRead = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0)
            {
                token.ThrowIfCancellationRequested();
                yield return new TabChunk
                {
                    Id = tabId,
                    IsMetadata = false,
                    Content = new string(buffer, 0, charsRead)
                };
            }
        }
    }

    private static TabChunk ErrorTabChunk(string tabId, string errorMessage)
    {
        return new TabChunk
        {
            Id = tabId,
            IsMetadata = false,
            IsError = true,
            Content = errorMessage
        };
    }

    public async IAsyncEnumerable<FileNode> ReadDirAsync(string dirPath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        var count = 0;
        IEnumerable<FileSystemInfo> entries;
        try
        {
            entries = new DirectoryInfo(dirPath).EnumerateFileSystemInfos();
        }
        catch (UnauthorizedAccessException ex)
        {
            logger.LogWarning("Access denied to {Path}: {Msg}", dirPath, ex.Message);
            yield break; // 如果根目录都打不开，直接退出
        }

        foreach (var entry in entries)
        {
            token.ThrowIfCancellationRequested();
            if (++count % 100 == 0)
            {
                await Task.Yield();
            }

            FileNode node;
            try
            {
                node = new FileNode
                {
                    Name = entry.Name,
                    Path = entry.FullName,
                    Extension = entry is FileInfo file ? file.Extension : string.Empty,
                    IsDirectory = entry is DirectoryInfo,
                    Expanded = false
                };
            }
            catch (UnauthorizedAccessException)
            {
                continue; // 跳过无权限的文件/文件夹
            }
            catch (PathTooLongException)
            {
                logger.LogWarning("Path too long: {Name}", entry.Name);
                continue;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error reading:  {Name}", entry.Name);
                continue;
            }

            yield return node;
        }
    }

    private const int YieldInterval = 8;

    public async IAsyncEnumerable<FileNode> QuickScanAsync(string dirPath, int maxDepth = 1,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        if (maxDepth < 1)
        {
            maxDepth = 1;
        }

        await foreach (var entry in EnumerateIndexEntries(dirPath, maxDepth, token))
        {
            // Skip the root directory itself for the explorer list
            if (entry.Depth == 0) continue;

            yield return new FileNode
            {
                Name = entry.Name,
                Path = entry.Path,
                Extension = entry.Extension,
                IsDirectory = entry.IsDirectory,
                Expanded = entry.IsDirectory && entry.Depth < maxDepth
            };
        }
    }

    public async IAsyncEnumerable<FileIndexEntry> DeepIndexAsync(string dirPath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        await foreach (var entry in EnumerateIndexEntries(dirPath, int.MaxValue, token))
        {
            yield return entry;
        }
    }

    private async IAsyncEnumerable<FileIndexEntry> EnumerateIndexEntries(string dirPath, int maxDepth,
        [EnumeratorCancellation] CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(dirPath))
        {
            yield break;
        }

        DirectoryInfo? root;
        try
        {
            root = new DirectoryInfo(dirPath);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Invalid path supplied for indexing: {Path}", dirPath);
            yield break;
        }

        if (!root.Exists)
        {
            logger.LogWarning("Skipping indexing for missing path: {Path}", dirPath);
            yield break;
        }

        var stack = new Stack<(DirectoryInfo Dir, int Depth)>();
        stack.Push((root, 0));

        while (stack.Count > 0)
        {
            var (current, depth) = stack.Pop();
            token.ThrowIfCancellationRequested();

            if (depth == 0)
            {
                var dirEntry = new FileIndexEntry(current.Name, current.FullName, string.Empty, true,
                    current.Parent?.FullName, depth);
                _fileIndex[current.FullName] = dirEntry;
                yield return dirEntry;
            }

            IEnumerable<FileSystemInfo> children;
            try
            {
                children = current.EnumerateFileSystemInfos();
            }
            catch (UnauthorizedAccessException ex)
            {
                logger.LogWarning("Access denied while indexing {Path}: {Message}", current.FullName, ex.Message);
                continue;
            }
            catch (PathTooLongException)
            {
                logger.LogWarning("Path too long while indexing: {Path}", current.FullName);
                continue;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to enumerate children for {Path}", current.FullName);
                continue;
            }

            foreach (var child in children)
            {
                token.ThrowIfCancellationRequested();

                var isDir = child is DirectoryInfo;
                var entry = new FileIndexEntry(
                    child.Name,
                    child.FullName,
                    child is FileInfo fi ? fi.Extension : string.Empty,
                    isDir,
                    current.FullName,
                    depth + 1);

                _fileIndex[entry.Path] = entry;
                yield return entry;

                if (isDir && depth + 1 < maxDepth)
                {
                    stack.Push(((DirectoryInfo)child, depth + 1));
                }
            }

            // Yield control periodically to keep the stream responsive
            if (depth % YieldInterval == 0)
            {
                await Task.Yield();
            }
        }
    }
}