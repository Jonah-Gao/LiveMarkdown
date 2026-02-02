using System.Runtime.CompilerServices;
using System.Runtime.Serialization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using JetBrains.Annotations;
using kernel.Utils;
using UtfUnknown;

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
        [property: UsedImplicitly] bool IsError = false,
        [property: UsedImplicitly] string Encoding = "utf-8"
    );

    /// <summary>
    /// View mode for the editor/preview split.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum ViewMode
    {
        [UsedImplicitly][EnumMember(Value = "code")] Code,
        [UsedImplicitly][EnumMember(Value = "split")] Split,
        [UsedImplicitly][EnumMember(Value = "preview")] Preview
    }

    /// <summary>
    /// Sidebar panel type.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum SidebarPanel
    {
        [UsedImplicitly][EnumMember(Value = "explorer")] Explorer,
        [UsedImplicitly][EnumMember(Value = "search")] Search,
        [UsedImplicitly][EnumMember(Value = "run")] Run,
        [UsedImplicitly][EnumMember(Value = "terminal")] Terminal
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
        string[] ExpandedDirectories,
        string ActiveFile = "",
        bool ExplorerVisible = true,
        bool SearchVisible = false,
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
    /// First yields metadata (including detected encoding), then yields content chunks.
    /// Uses Mozilla Universal Charset Detector to detect file encoding.
    /// </summary>
    public async IAsyncEnumerable<TabChunk> StreamTabAsync(string filePath,
        [EnumeratorCancellation] CancellationToken token = default)
    {
        var tabId = Guid.NewGuid().ToString();

        // Detect file encoding using Mozilla Universal Charset Detector
        var detectedEncoding = "utf-8";
        try
        {
            var result = await CharsetDetector.DetectFromFileAsync(filePath, token);
            if (result.Detected?.EncodingName != null)
            {
                // Treat ASCII as UTF-8 for frontend compatibility
                detectedEncoding = result.Detected.EncodingName.Equals("ASCII", StringComparison.OrdinalIgnoreCase)
                    ? "utf-8"
                    : result.Detected.EncodingName;
                logger.LogDebug("Detected encoding for {FilePath}: {Encoding}", 
                    LogFormatter.ToGreen(filePath), detectedEncoding);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to detect encoding for {FilePath}, defaulting to UTF-8", filePath);
        }

        // First return tab metadata so frontend can create the tab immediately
        yield return new TabChunk(
            Id: tabId,
            Name: Path.GetFileName(filePath),
            Path: filePath,
            IsMetadata: true,
            Encoding: detectedEncoding
        );

        await foreach (var chunk in StreamFileContentAsync(tabId, filePath, detectedEncoding, token))
        {
            yield return chunk;
        }
    }

    /// <summary>
    /// Stream file content in chunks using the specified encoding.
    /// </summary>
    private async IAsyncEnumerable<TabChunk> StreamFileContentAsync(string tabId, string filePath, 
        string encodingName, [EnumeratorCancellation] CancellationToken token = default)
    {
        TabChunk? errorTabChunk = null;
        Encoding encoding;
        
        try
        {
            encoding = GetEncodingByName(encodingName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get encoding {EncodingName}, falling back to UTF-8", encodingName);
            encoding = Encoding.UTF8;
        }
        
        StreamReader? reader = null;
        try
        {
            reader = new StreamReader(filePath, encoding, detectEncodingFromByteOrderMarks: true);
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
            int charsRead;
            while ((charsRead = await reader!.ReadAsync(buffer, 0, buffer.Length)) > 0)
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
    /// Get the Encoding object by name, with fallback to UTF-8.
    /// </summary>
    private static Encoding GetEncodingByName(string encodingName)
    {
        // Common encoding name mappings
        return encodingName.ToLowerInvariant() switch
        {
            "utf-8" or "utf8" => Encoding.UTF8,
            "utf-16le" or "utf-16" => Encoding.Unicode,
            "utf-16be" => Encoding.BigEndianUnicode,
            "utf-32" or "utf-32le" => Encoding.UTF32,
            "ascii" => Encoding.UTF8,
            "iso-8859-1" or "latin1" => Encoding.Latin1,
            _ => Encoding.GetEncoding(encodingName)
        };
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

    public void CreateFile(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            logger.LogError("Invalid file path: {FilePath}", LogFormatter.ToBrightRed(filePath));
            return;
        }

        // Normalize and validate path
        var fullPath = Path.GetFullPath(filePath);
        try
        {
            using var fs = File.Create(fullPath);
            logger.LogInformation("File created: {FilePath}", LogFormatter.ToGreen(fullPath));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error creating file: {FilePath}", LogFormatter.ToBrightRed(fullPath));
        }
    }

    public void DeleteFile(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            logger.LogError("Invalid file path: {FilePath}", LogFormatter.ToBrightRed(filePath));
            return;
        }

        // Normalize and validate path
        var fullPath = Path.GetFullPath(filePath);
        try
        {
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
                logger.LogInformation("File deleted: {FilePath}", LogFormatter.ToGreen(fullPath));
            }
            else
            {
                logger.LogWarning("File does not exist: {FilePath}", LogFormatter.ToBrightRed(fullPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error deleting file: {FilePath}", LogFormatter.ToBrightRed(fullPath));
        }
    }

    public void DeleteDirectory(string dirPath)
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
            if (Directory.Exists(fullPath))
            {
                Directory.Delete(fullPath, recursive: true);
                logger.LogInformation("Directory deleted: {DirPath}", LogFormatter.ToGreen(fullPath));
            }
            else
            {
                logger.LogWarning("Directory does not exist: {DirPath}", LogFormatter.ToBrightRed(fullPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error deleting directory: {DirPath}", LogFormatter.ToBrightRed(fullPath));
        }
    }

    public void MoveFile(string oldFilePath, string newFilePath)
    {
        if (string.IsNullOrWhiteSpace(oldFilePath) || string.IsNullOrWhiteSpace(newFilePath))
        {
            logger.LogError("Invalid file paths: {OldFilePath}, {NewFilePath}",
                LogFormatter.ToBrightRed(oldFilePath),
                LogFormatter.ToBrightRed(newFilePath));
            return;
        }

        // Normalize and validate paths
        var fullOldPath = Path.GetFullPath(oldFilePath);
        var fullNewPath = Path.GetFullPath(newFilePath);
        try
        {
            if (File.Exists(fullOldPath))
            {
                File.Move(fullOldPath, fullNewPath);
                logger.LogInformation("File renamed from {OldFilePath} to {NewFilePath}",
                    LogFormatter.ToGreen(fullOldPath),
                    LogFormatter.ToGreen(fullNewPath));
            }
            else
            {
                logger.LogWarning("Source file does not exist: {OldFilePath}", LogFormatter.ToBrightRed(fullOldPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error renaming file from {OldFilePath} to {NewFilePath}",
                LogFormatter.ToBrightRed(fullOldPath),
                LogFormatter.ToBrightRed(fullNewPath));
        }
    }
    
    public void MoveDirectory(string oldFilePath, string newFilePath)
    {
        if (string.IsNullOrWhiteSpace(oldFilePath) || string.IsNullOrWhiteSpace(newFilePath))
        {
            logger.LogError("Invalid directory paths: {OldDirPath}, {NewDirPath}",
                LogFormatter.ToBrightRed(oldFilePath),
                LogFormatter.ToBrightRed(newFilePath));
            return;
        }

        // Normalize and validate paths
        var fullOldPath = Path.GetFullPath(oldFilePath);
        var fullNewPath = Path.GetFullPath(newFilePath);
        try
        {
            if (Directory.Exists(fullOldPath))
            {
                Directory.Move(fullOldPath, fullNewPath);
                logger.LogInformation("Directory renamed from {OldDirPath} to {NewDirPath}",
                    LogFormatter.ToGreen(fullOldPath),
                    LogFormatter.ToGreen(fullNewPath));
            }
            else
            {
                logger.LogWarning("Source directory does not exist: {OldDirPath}", LogFormatter.ToBrightRed(fullOldPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error renaming directory from {OldDirPath} to {NewDirPath}",
                LogFormatter.ToBrightRed(fullOldPath),
                LogFormatter.ToBrightRed(fullNewPath));
        }
    }

    public void CopyFile(string oldFilePath, string newFilePath)
    {
        if (string.IsNullOrWhiteSpace(oldFilePath) || string.IsNullOrWhiteSpace(newFilePath))
        {
            logger.LogError("Invalid file paths: {OldFilePath}, {NewFilePath}",
                LogFormatter.ToBrightRed(oldFilePath),
                LogFormatter.ToBrightRed(newFilePath));
            return;
        }

        // Normalize and validate paths
        var fullOldPath = Path.GetFullPath(oldFilePath);
        var fullNewPath = Path.GetFullPath(newFilePath);
        try
        {
            if (File.Exists(fullOldPath))
            {
                File.Copy(fullOldPath, fullNewPath, overwrite: false);
                logger.LogInformation("File copied from {OldFilePath} to {NewFilePath}",
                    LogFormatter.ToGreen(fullOldPath),
                    LogFormatter.ToGreen(fullNewPath));
            }
            else
            {
                logger.LogWarning("Source file does not exist: {OldFilePath}", LogFormatter.ToBrightRed(fullOldPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error copying file from {OldFilePath} to {NewFilePath}",
                LogFormatter.ToBrightRed(fullOldPath),
                LogFormatter.ToBrightRed(fullNewPath));
        }
    }
    
    public void CopyDirectory(string oldDirPath, string newDirPath)
    {
        if (string.IsNullOrWhiteSpace(oldDirPath) || string.IsNullOrWhiteSpace(newDirPath))
        {
            logger.LogError("Invalid directory paths: {OldDirPath}, {NewDirPath}",
                LogFormatter.ToBrightRed(oldDirPath),
                LogFormatter.ToBrightRed(newDirPath));
            return;
        }

        // Normalize and validate paths
        var fullOldPath = Path.GetFullPath(oldDirPath);
        var fullNewPath = Path.GetFullPath(newDirPath);
        try
        {
            if (Directory.Exists(fullOldPath))
            {
                CopyDirectoryRecursive(fullOldPath, fullNewPath);
                logger.LogInformation("Directory copied from {OldDirPath} to {NewDirPath}",
                    LogFormatter.ToGreen(fullOldPath),
                    LogFormatter.ToGreen(fullNewPath));
            }
            else
            {
                logger.LogWarning("Source directory does not exist: {OldDirPath}", LogFormatter.ToBrightRed(fullOldPath));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error copying directory from {OldDirPath} to {NewDirPath}",
                LogFormatter.ToBrightRed(fullOldPath),
                LogFormatter.ToBrightRed(fullNewPath));
        }
    }
    
    private static void CopyDirectoryRecursive(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);

        foreach (var filePath in Directory.GetFiles(sourceDir))
        {
            var destFilePath = Path.Combine(destDir, Path.GetFileName(filePath));
            File.Copy(filePath, destFilePath, overwrite: false);
        }

        foreach (var directoryPath in Directory.GetDirectories(sourceDir))
        {
            var destDirectoryPath = Path.Combine(destDir, Path.GetFileName(directoryPath));
            CopyDirectoryRecursive(directoryPath, destDirectoryPath);
        }
    }
    
    /// <summary>
    /// Save file content from a stream to disk.
    /// Uses atomic write with temporary file for data safety.
    /// </summary>
    /// <param name="filePath">The target file path</param>
    /// <param name="stream">The content stream to write</param>
    /// <param name="encodingName">The encoding to use when saving (default: utf-8)</param>
    /// <param name="ct">Cancellation token</param>
    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream, 
        string encodingName = "utf-8", CancellationToken ct = default)
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
        
        // Get the encoding to use for saving
        Encoding encoding;
        try
        {
            encoding = GetEncodingByName(encodingName);
            logger.LogDebug("Saving file {FilePath} with encoding: {Encoding}", 
                LogFormatter.ToGreen(fullPath), encodingName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get encoding {EncodingName}, falling back to UTF-8", encodingName);
            encoding = Encoding.UTF8;
        }

        try
        {
            await using (var writer = new StreamWriter(tempPath, false, encoding, 65536))
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