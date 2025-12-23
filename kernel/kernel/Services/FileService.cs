using System.Runtime.CompilerServices;
using JetBrains.Annotations;
using kernel.Utils;

namespace kernel.Services;


// TODO: Directory watching to auto-refresh file tree and open tabs on changes
// TODO: Indexing the directory in a background task for faster access
// TODO: file operations: create, delete, rename, move, copy
public class FileService(ILogger<FileService> logger)
{
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

    public async IAsyncEnumerable<TabChunk> StreamTabAsync(string fileName, string filePath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        string tabId = Guid.NewGuid().ToString();

        // 1. 先返回 Tab 元数据
        yield return new TabChunk()
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

    private TabChunk ErrorTabChunk(string tabId, string errorMessage)
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
        int count = 0;
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
                    Expanded = false,
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
}