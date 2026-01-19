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
    /// <param name="dirPath"></param>
    public void CreateDirectory(string dirPath)
    {
        _logger.LogInformation("Creating directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        _fileService.CreateDirectory(dirPath);
    }

    /// <summary>
    /// Save file content from a stream.
    /// </summary>
    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream)
    {
        _logger.LogInformation("Saving file: {FilePath}", LogFormatter.ToGreen(filePath));
        await _fileService.SaveFileAsync(filePath, stream);
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