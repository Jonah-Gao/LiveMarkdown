using System.Runtime.CompilerServices;
using kernel.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Services;

public class FileService
{
    public class FileNode
    {
        public string Name { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
        public string Extension { get; set; } = string.Empty;
        public bool IsDirectory { get; set; }
        public IAsyncEnumerable<FileNode>? Children { get; set; }
        public bool? Expanded { get; set; }
    }

    public class TabChunk
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public bool IsMetadata { get; set; }
        public bool IsError { get; set; }
    }

    private readonly ILogger<FileService> _logger;
    private readonly IHubContext<FileHub> _hubContext;

    public FileService(ILogger<FileService> logger, IHubContext<FileHub> hubContext)
    {
        _logger = logger;
        _hubContext = hubContext;
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
            _logger.LogError(ex, "Access denied: {FilePath}", filePath);
            errorTabChunk = ErrorTabChunk(tabId, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cannot open file: {FilePath}", filePath);
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
            _logger.LogWarning("Access denied to {Path}: {Msg}", dirPath, ex.Message);
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
                _logger.LogWarning("Path too long: {Name}", entry.Name);
                continue;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reading:  {Name}", entry.Name);
                continue;
            }

            yield return node;
        }
    }
}