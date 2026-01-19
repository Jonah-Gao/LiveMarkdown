using System.Runtime.CompilerServices;
using System.Runtime.Serialization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using JetBrains.Annotations;
using kernel.Utils;

namespace kernel.Services;

/// <summary>
/// Service for file system operations including reading directories,
/// streaming file content, and managing workspace settings.
/// </summary>
/// <remarks>
/// TODO: Directory watching to auto-refresh file tree and open tabs on changes
/// </remarks>
public class FileService(ILogger<FileService> logger)
{
    /// <summary>
    /// Represents a file or directory node in the file tree.
    /// Used as a DTO for streaming directory contents to the frontend.
    /// </summary>
    public record FileNode(
        [property: UsedImplicitly] string Name,
        [property: UsedImplicitly] string Path,
        [property: UsedImplicitly] string Extension,
        [property: UsedImplicitly] bool IsDirectory,
        [property: UsedImplicitly] string ParentPath,
        [property: UsedImplicitly] bool Expanded = false
    );

    /// <summary>
    /// Represents a chunk of file content for streaming.
    /// Can be metadata (file info), content (file data), or error.
    /// </summary>
    public record TabChunk(
        [property: UsedImplicitly] string Id,
        [property: UsedImplicitly] string Name = "",
        [property: UsedImplicitly] string Path = "",
        [property: UsedImplicitly] string Content = "",
        [property: UsedImplicitly] bool IsMetadata = false,
        [property: UsedImplicitly] bool IsError = false
    );

    /// <summary>
    /// View mode for the editor/preview split.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum ViewMode
    {
        [EnumMember(Value = "code")] Code,
        [EnumMember(Value = "split")] Split,
        [EnumMember(Value = "preview")] Preview,
    }

    /// <summary>
    /// Sidebar panel type.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum SidebarPanel
    {
        [EnumMember(Value = "explorer")] Explorer,
        [EnumMember(Value = "search")] Search,
        [EnumMember(Value = "run")] Run,
        [EnumMember(Value = "terminal")] Terminal,
    }

    /// <summary>
    /// Layout configuration for the workspace panels.
    /// Persisted to workspace settings file.
    /// </summary>
    public record PanelLayout(
        double ExplorerWidth,
        double TerminalHeight,
        double EditorPreviewRatio,
        ViewMode PreferredViewMode,
        string[] OpenedFiles,
        string ActiveFile = "",
        bool ExplorerVisible = true,
        bool TerminalVisible = false,
        SidebarPanel? ActiveTopPanel = SidebarPanel.Explorer,
        SidebarPanel? ActiveBottomPanel = null
    );

    /// <summary>
    /// JSON serializer options for workspace settings.
    /// </summary>
    private static readonly JsonSerializerOptions JsonSerializerOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters =
        {
            new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)
        }
    };

    /// <summary>
    /// Stream file content as chunks for efficient loading of large files.
    /// First yields metadata, then yields content chunks.
    /// </summary>
    public async IAsyncEnumerable<TabChunk> StreamTabAsync(string filePath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        var tabId = Guid.NewGuid().ToString();

        // First return tab metadata so frontend can create the tab immediately
        yield return new TabChunk(
            Id: tabId,
            Name: Path.GetFileName(filePath),
            Path: filePath,
            IsMetadata: true
        );

        await foreach (var chunk in StreamFileContentAsync(tabId, filePath, token))
        {
            yield return chunk;
        }
    }

    /// <summary>
    /// Stream file content in chunks.
    /// </summary>
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
            errorTabChunk = CreateErrorTabChunk(tabId, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Cannot open file: {FilePath}", LogFormatter.ToBrightRed(filePath));
            errorTabChunk = CreateErrorTabChunk(tabId, ex.Message);
        }

        if (errorTabChunk != null)
        {
            yield return errorTabChunk;
            yield break;
        }

        using (reader)
        {
            const int chunkSize = 65536; // 64KiB per chunk for efficient streaming
            var buffer = new char[chunkSize];
            using var stream = File.OpenText(filePath);
            int charsRead;
            while ((charsRead = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0)
            {
                token.ThrowIfCancellationRequested();
                yield return new TabChunk(
                    Id: tabId,
                    Content: new string(buffer, 0, charsRead)
                );
            }
        }
    }

    /// <summary>
    /// Create an error tab chunk for reporting file access errors.
    /// </summary>
    private static TabChunk CreateErrorTabChunk(string tabId, string errorMessage)
    {
        return new TabChunk(
            Id: tabId,
            Content: errorMessage,
            IsError: true
        );
    }

    /// <summary>
    /// Read directory contents recursively using BFS.
    /// Streams results as they are discovered.
    /// </summary>
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
                yield break; // Exit if root directory cannot be opened
            }
            catch (DirectoryNotFoundException)
            {
                continue;
            }

            foreach (var entry in entries)
            {
                token.ThrowIfCancellationRequested();

                // Yield periodically to avoid blocking
                if (++count % 100 == 0)
                {
                    await Task.Yield();
                }

                FileNode? node;
                try
                {
                    node = new FileNode(
                        Name: entry.Name,
                        Path: entry.FullName,
                        Extension: entry is FileInfo file ? file.Extension : string.Empty,
                        IsDirectory: entry is DirectoryInfo,
                        ParentPath: currentDir,
                        Expanded: false
                    );
                }
                catch (UnauthorizedAccessException)
                {
                    continue; // Skip files/folders without permissions
                }
                catch (PathTooLongException)
                {
                    logger.LogWarning("Path too long: {Name}", entry.Name);
                    continue;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error reading: {Name}", entry.Name);
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

    /// <summary>
    /// Create a directory at the specified path.
    /// </summary>
    /// <param name="dirPath"></param>
    public void CreateDirectory(string dirPath)
    {
        if (string.IsNullOrWhiteSpace(dirPath))
        {
            logger.LogError("Invalid directory path: {DirPath}", LogFormatter.ToBrightRed(dirPath));
            return;
        }

        // Normalize and validate path
        var fullPath = Path.GetFullPath(dirPath);
        try
        {
            Directory.CreateDirectory(fullPath);
            logger.LogInformation("Directory created: {DirPath}", LogFormatter.ToGreen(fullPath));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error creating directory: {DirPath}", LogFormatter.ToBrightRed(fullPath));
        }
    }

    /// <summary>
    /// Save file content from a stream to disk.
    /// Uses atomic write with temporary file for data safety.
    /// </summary>
    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            logger.LogError("Invalid file path: {FilePath}", LogFormatter.ToBrightRed(filePath));
            return;
        }

        // Normalise and validate path
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

            // Atomic replace for data safety
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
            // Clean up temporary file on failure
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    /// <summary>
    /// Save workspace settings to a JSON file in the workspace directory.
    /// </summary>
    public async Task SaveWorkspaceSettingsAsync(string cwd, PanelLayout layout, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cwd))
        {
            logger.LogError("Invalid layout path: {LayoutPath}", LogFormatter.ToBrightRed(cwd));
            return;
        }

        // Normalise and validate path
        var fullPath = Path.GetFullPath(cwd);
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
                options: JsonSerializerOptions
            );

            await File.WriteAllTextAsync(tempPath, json, Encoding.UTF8, ct);

            // Atomic replace for data safety
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
            logger.LogError("Error saving layout: {Error}", LogFormatter.ToBrightRed(ex.Message));
            // Clean up temporary file on failure
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }

    /// <summary>
    /// Load workspace settings from a JSON file in the workspace directory.
    /// </summary>
    public async Task<PanelLayout?> LoadWorkspaceSettingsAsync(string cwd, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cwd))
        {
            logger.LogError("Invalid layout path: {LayoutPath}", LogFormatter.ToBrightRed(cwd));
            return null;
        }

        // Normalise and validate path
        var fullPath = Path.GetFullPath(cwd);
        var settingsFile = Path.Join(fullPath, ".LiveMarkdown", "settings.json");
        if (!File.Exists(settingsFile))
        {
            logger.LogWarning("Layout file does not exist: {LayoutPath}", LogFormatter.ToBrightRed(settingsFile));
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(settingsFile);
            var layout =
                await JsonSerializer.DeserializeAsync<PanelLayout>(stream, options: JsonSerializerOptions,
                    cancellationToken: ct);
            logger.LogInformation("Layout loaded: {LayoutPath}", LogFormatter.ToGreen(settingsFile));
            return layout;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error loading layout: {LayoutPath}", LogFormatter.ToBrightRed(fullPath));
            return null;
        }
    }
}