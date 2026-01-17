using System.Runtime.CompilerServices;
using System.Runtime.Serialization;
using System.Text;
using System.Threading.Channels;
using JetBrains.Annotations;
using kernel.Utils;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace kernel.Services;

// TODO: Directory watching to auto-refresh file tree and open tabs on changes
public class FileService(ILogger<FileService> logger)
{
    public class FileNode
    {
        [UsedImplicitly] public string Name { get; set; } = string.Empty;
        [UsedImplicitly] public string Path { get; set; } = string.Empty;
        [UsedImplicitly] public string Extension { get; set; } = string.Empty;
        [UsedImplicitly] public bool IsDirectory { get; set; }
        [UsedImplicitly] public string ParentPath { get; set; } = string.Empty;
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

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum ViewMode
    {
        [EnumMember(Value = "code")] Code,
        [EnumMember(Value = "split")] Split,
        [EnumMember(Value = "preview")] Preview,
    }

    public record PanelLayout(
        double ExplorerWidth,
        double TerminalHeight,
        double EditorPreviewRatio,
        ViewMode PreferredViewMode,
        string WorkingDirectory,
        string[] OpenedFiles
    );

    public async IAsyncEnumerable<TabChunk> StreamTabAsync(string filePath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        var tabId = Guid.NewGuid().ToString();

        // 1. 先返回 Tab 元数据
        yield return new TabChunk
        {
            Id = tabId,
            Name = Path.GetFileName(filePath),
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
        [EnumeratorCancellation] CancellationToken token = default)
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
            const int chunkSize = 65536; // 64KiB per chunk
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
        var queue = new Queue<string>();
        queue.Enqueue(dirPath);

        var count = 0;

        while (queue.Count > 0)
        {
            token.ThrowIfCancellationRequested();

            var currentDir = queue.Dequeue();

            IEnumerable<FileSystemInfo> entries;
            try
            {
                entries = new DirectoryInfo(currentDir).EnumerateFileSystemInfos();
            }
            catch (UnauthorizedAccessException ex)
            {
                logger.LogWarning("Access denied to {Path}: {Msg}", dirPath, ex.Message);
                yield break; // 如果根目录都打不开，直接退出
            }
            catch (DirectoryNotFoundException)
            {
                continue;
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
                        ParentPath = currentDir,
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

                // BFS: enqueue directories for further exploration
                if (entry is DirectoryInfo)
                {
                    queue.Enqueue(entry.FullName);
                }
            }
        }
    }

    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            logger.LogError("Invalid file path: {FilePath}", LogFormatter.ToBrightRed(filePath));
            return;
        }

        // Normalize & restrict
        var fullPath = Path.GetFullPath(filePath);
        var dir = Path.GetDirectoryName(fullPath);
        if (string.IsNullOrEmpty(dir))
        {
            logger.LogError("Invalid file path: {FilePath}", LogFormatter.ToBrightRed(filePath));
            return;
        }

        Directory.CreateDirectory(dir);

        var tempPath = Path.Combine(dir, $"{Path.GetFileName(fullPath)}.{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var writer = new StreamWriter(tempPath, false, Encoding.UTF8, 65536))
            {
                await foreach (var chunk in stream.ReadAllAsync(ct))
                {
                    await writer.WriteAsync(chunk);
                }
            }

            // Prefer same-volume atomic replace
            if (File.Exists(fullPath))
            {
                File.Replace(tempPath, fullPath, destinationBackupFileName: null, ignoreMetadataErrors: true);
            }
            else
            {
                File.Move(tempPath, fullPath, overwrite: true);
            }

            logger.LogInformation("File saved: {FilePath}", LogFormatter.ToGreen(fullPath));
        }
        catch
        {
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    public async Task SaveWorkspaceSettingsAsync(string cwd, PanelLayout layout, CancellationToken ct = default)
    {
        var dirPath = layout.WorkingDirectory;
        if (string.IsNullOrWhiteSpace(dirPath))
        {
            logger.LogError("Invalid layout path: {LayoutPath}", LogFormatter.ToBrightRed(dirPath));
            return;
        }

        // Normalize & restrict
        var fullPath = Path.GetFullPath(dirPath); // 工作目录
        var settingsDir = Path.Combine(fullPath, ".LiveMarkdown");
        var settingsFile = Path.Combine(settingsDir, "settings.json");
        logger.LogInformation("Saving settings file: {SettingsFilePath}", LogFormatter.ToGreen(settingsFile));

        Directory.CreateDirectory(settingsDir);

        var tempPath = Path.Combine(
            settingsDir,
            $"{Path.GetFileName(fullPath)}.{Guid.NewGuid():N}.tmp"
        );

        try
        {
            var json = JsonSerializer.Serialize(
                layout,
                options: new JsonSerializerOptions { WriteIndented = true }
            );

            await File.WriteAllTextAsync(tempPath, json, Encoding.UTF8, ct);

            // atomic replace (requires same volume)

            if (File.Exists(settingsFile))
            {
                File.Replace(tempPath, settingsFile, destinationBackupFileName: null, ignoreMetadataErrors: true);
            }
            else
            {
                File.Move(tempPath, settingsFile, overwrite: true);
            }

            logger.LogInformation("Layout saved: {LayoutPath}", LogFormatter.ToGreen(settingsFile));
        }
        catch (Exception ex)
        {
            logger.LogError("Error saving layout: {ex}", LogFormatter.ToBrightRed(ex.Message));
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    public async Task<PanelLayout?> LoadWorkspaceSettingsAsync(string cwd, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cwd))
        {
            logger.LogError("Invalid layout path: {LayoutPath}", LogFormatter.ToBrightRed(cwd));
            return null;
        }

        // Normalize & restrict
        var fullPath = Path.GetFullPath(cwd);
        var settingsDir = Path.Join(fullPath, ".LiveMarkdown", "settings.json");
        if (!File.Exists(settingsDir))
        {
            logger.LogWarning("Layout file does not exist: {LayoutPath}", LogFormatter.ToBrightRed(settingsDir));
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(settingsDir);
            var layout = await JsonSerializer.DeserializeAsync<PanelLayout>(stream, cancellationToken: ct);
            logger.LogInformation("Layout loaded: {LayoutPath}", LogFormatter.ToGreen(settingsDir));
            return layout;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error loading layout: {LayoutPath}", LogFormatter.ToBrightRed(fullPath));
            return null;
        }
    }
}