using System.Threading.Channels;
using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

/// <summary>
/// SignalR hub for file system operations.
/// Provides streaming file tree reading, file content streaming, workspace settings,
/// and file system watching for incremental updates.
/// </summary>
public class FileHub : Hub
{
    private readonly FileService _fileService;
    private readonly FileWatcherService _fileWatcherService;
    private readonly IHubContext<FileHub> _hubContext;
    private readonly ILogger<FileHub> _logger;

    // Track which directories each connection is watching
    private static readonly Dictionary<string, HashSet<string>> ConnectionWatchedDirs = new();
    private static readonly Lock Lock = new();

    public FileHub(
        FileService fileService,
        FileWatcherService fileWatcherService,
        IHubContext<FileHub> hubContext,
        ILogger<FileHub> logger)
    {
        _fileService = fileService;
        _fileWatcherService = fileWatcherService;
        _hubContext = hubContext;
        _logger = logger;

        _fileWatcherService.DirectoryDirty -= OnDirectoryDirty;
        _fileWatcherService.DirectoryDirty += OnDirectoryDirty;
    }


    /// <summary>
    /// Called by FileWatcherService when a directory change is detected.
    /// Broadcasts to clients watching that directory.
    /// </summary>
    /// <param name="rootPath">
    /// the top-level directory being watched (the one clients subscribe to).
    /// </param>
    /// <param name="dirPath">
    /// dirPath is the specific directory that changed (could be rootPath or a subdirectory
    /// </param>
    private void OnDirectoryDirty(string rootPath, string dirPath)
    {
        var groupName = GetGroupName(rootPath);
        _hubContext.Clients.Group(groupName).SendAsync("DirectoryDirty", dirPath);
        _logger.LogDebug("Broadcasted directory dirty to group {Group}: {DirPath}", groupName, dirPath);
    }

    /// <summary>
    /// Start watching a directory for file changes.
    /// The client will receive FileChanged events for this directory.
    /// </summary>
    public async Task StartWatchingAsync(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            _logger.LogWarning("Invalid directory path for watching");
            return;
        }


        var fullPath = Path.GetFullPath(directoryPath);
        var groupName = GetGroupName(fullPath);

        if (_fileWatcherService.IsWatching(fullPath))
        {
            return;
        }

        // Add this connection to the group
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);

        // Track which directories this connection is watching
        lock (Lock)
        {
            if (!ConnectionWatchedDirs.TryGetValue(Context.ConnectionId, out var dirs))
            {
                dirs = [];
                ConnectionWatchedDirs[Context.ConnectionId] = dirs;
            }

            dirs.Add(fullPath);
        }

        // Start the watcher if not already watching
        _fileWatcherService.StartWatching(fullPath);
        _logger.LogInformation("Client {ConnectionId} started watching: {Path}",
            Context.ConnectionId, LogFormatter.ToGreen(fullPath));
    }

    /// <summary>
    /// Stop watching a directory for file changes.
    /// </summary>
    public async Task StopWatchingAsync(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            return;
        }

        var fullPath = Path.GetFullPath(directoryPath);
        var groupName = GetGroupName(fullPath);
        
        if (!_fileWatcherService.IsWatching(fullPath))
        {
            return;
        }

        // Remove this connection from the group
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);

        // Update tracking
        lock (Lock)
        {
            if (ConnectionWatchedDirs.TryGetValue(Context.ConnectionId, out var dirs))
            {
                dirs.Remove(fullPath);
            }
        }
        
        _fileWatcherService.StopWatching(fullPath);

        _logger.LogInformation("Client {ConnectionId} stopped watching: {Path}",
            Context.ConnectionId, LogFormatter.ToYellow(fullPath));
    }

    /// <summary>
    /// Called when a client disconnects. Clean up watched directories.
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        lock (Lock)
        {
            ConnectionWatchedDirs.Remove(Context.ConnectionId);
        }

        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    private static string GetGroupName(string directoryPath) => $"watch:{directoryPath}";

    /// <summary>
    /// Read directory contents recursively and stream results.
    /// </summary>
    public IAsyncEnumerable<FileService.FileNode> ReadDirAsync(string dirPath)
    {
        _logger.LogDebug("Reading files in directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        return _fileService.ReadDirAsync(dirPath);
    }

    /// <summary>
    /// Stream file content for opening in a tab.
    /// </summary>
    public IAsyncEnumerable<FileService.TabChunk> StreamTabAsync(string filePath)
    {
        _logger.LogInformation("Creating tab for file: {FilePath}", LogFormatter.ToGreen(filePath));
        return _fileService.StreamTabAsync(filePath);
    }

    /// <summary>
    /// Create a new directory.
    /// </summary>
    public void CreateDirectory(string dirPath)
    {
        _logger.LogInformation("Creating directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        _fileService.CreateDirectory(dirPath);
    }

    public void DeleteDirectory(string dirPath)
    {
        _logger.LogInformation("Deleting directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        _fileService.DeleteDirectory(dirPath);
    }

    public void MoveDirectory(string sourcePath, string destPath)
    {
        _logger.LogInformation("Moving directory from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.MoveDirectory(sourcePath, destPath);
    }

    public void RenameDirectory(string sourcePath, string destPath)
    {
        _logger.LogInformation("Renaming directory from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.MoveDirectory(sourcePath, destPath);
    }

    public void CopyDirectory(string sourcePath, string destPath)
    {
        _logger.LogInformation("Copying directory from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.CopyDirectory(sourcePath, destPath);
    }

    public void CreateFile(string filePath)
    {
        _logger.LogInformation("Creating file: {FilePath}", LogFormatter.ToGreen(filePath));
        _fileService.CreateFile(filePath);
    }

    public void DeleteFile(string filePath)
    {
        _logger.LogInformation("Deleting file: {FilePath}", LogFormatter.ToGreen(filePath));
        _fileService.DeleteFile(filePath);
    }

    public void MoveFile(string sourcePath, string destPath)
    {
        _logger.LogInformation("Moving file from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.MoveFile(sourcePath, destPath);
    }

    public void RenameFile(string sourcePath, string destPath)
    {
        _logger.LogInformation("Renaming file from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.MoveFile(sourcePath, destPath);
    }

    public void CopyFile(string sourcePath, string destPath)
    {
        _logger.LogInformation("Copying file from {SourcePath} to {DestPath}",
            LogFormatter.ToGreen(sourcePath), LogFormatter.ToGreen(destPath));
        _fileService.CopyFile(sourcePath, destPath);
    }

    /// <summary>
    /// Save file content from a stream.
    /// </summary>
    /// <param name="filePath">The target file path</param>
    /// <param name="stream">The content stream to write</param>
    /// <param name="encoding">The encoding to use when saving (default: utf-8)</param>
    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream, string encoding = "utf-8")
    {
        _logger.LogInformation("Saving file: {FilePath} with encoding: {Encoding}",
            LogFormatter.ToGreen(filePath), encoding);
        await _fileService.SaveFileAsync(filePath, stream, encoding);
    }

    /// <summary>
    /// Save workspace settings to disk.
    /// </summary>
    public async Task SaveWorkspaceSettingsAsync(string cwd, FileService.PanelLayout layout)
    {
        _logger.LogInformation("Saving panel layout to: {LayoutPath}", LogFormatter.ToGreen(cwd));
        await _fileService.SaveWorkspaceSettingsAsync(cwd, layout);
    }

    /// <summary>
    /// Load workspace settings from disk.
    /// </summary>
    public async Task<FileService.PanelLayout?> LoadWorkspaceSettingsAsync(string cwd)
    {
        _logger.LogInformation("Loading panel layout from: {LayoutPath}", LogFormatter.ToGreen(cwd));
        return await _fileService.LoadWorkspaceSettingsAsync(cwd);
    }
}