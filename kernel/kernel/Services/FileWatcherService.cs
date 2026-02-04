using System.Collections.Concurrent;

namespace kernel.Services;

/// <summary>
/// Service for watching file system changes and notifying clients.
/// Detects create, delete, and rename operations for incremental directory updates.
/// </summary>
public class FileWatcherService(ILogger<FileWatcherService> logger) : IDisposable
{
    private readonly ConcurrentDictionary<string, FileSystemWatcher> _watchers = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _directoryDebounceTokens = new();
    private const int DirectoryDebounceMs = 200;
    private bool _disposed;

    /// <summary>
    /// Event raised when a directory is marked dirty (debounced). Only the dirty directory path is provided.
    /// </summary>
    public event Action<string, string>? DirectoryDirty;

    /// <summary>
    /// Start watching a directory for file system changes.
    /// </summary>
    /// <param name="directoryPath">The directory to watch.</param>
    /// <returns>True if watching started successfully, false otherwise.</returns>
    public bool StartWatching(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            logger.LogWarning("Invalid directory path for watching");
            return false;
        }

        var fullPath = Path.GetFullPath(directoryPath);

        if (!Directory.Exists(fullPath))
        {
            logger.LogWarning("Directory does not exist: {Path}", fullPath);
            return false;
        }

        if (_watchers.ContainsKey(fullPath))
        {
            logger.LogDebug("Already watching directory: {Path}", fullPath);
            return true;
        }

        try
        {
            var watcher = new FileSystemWatcher(fullPath)
            {
                NotifyFilter = NotifyFilters.FileName
                               | NotifyFilters.DirectoryName
                               | NotifyFilters.CreationTime,
                IncludeSubdirectories = true,
                EnableRaisingEvents = false
            };

            watcher.Created += OnCreated;
            watcher.Deleted += OnDeleted;
            watcher.Renamed += OnRenamed;
            watcher.Error += OnError;

            if (_watchers.TryAdd(fullPath, watcher))
            {
                watcher.EnableRaisingEvents = true;
                logger.LogInformation("Started watching directory: {Path}", fullPath);
                return true;
            }

            watcher.Dispose();
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to start watching directory: {Path}", fullPath);
            return false;
        }
    }

    /// <summary>
    /// Stop watching a directory.
    /// </summary>
    /// <param name="directoryPath">The directory to stop watching.</param>
    public void StopWatching(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath)) return;

        var fullPath = Path.GetFullPath(directoryPath);

        if (_watchers.TryRemove(fullPath, out var watcher))
        {
            watcher.EnableRaisingEvents = false;
            watcher.Created -= OnCreated;
            watcher.Deleted -= OnDeleted;
            watcher.Renamed -= OnRenamed;
            watcher.Error -= OnError;
            watcher.Dispose();
            logger.LogInformation("Stopped watching directory: {Path}", fullPath);
        }
    }

    /// <summary>
    /// Check if a directory is being watched.
    /// </summary>
    public bool IsWatching(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath)) return false;
        var fullPath = Path.GetFullPath(directoryPath);
        return _watchers.ContainsKey(fullPath);
    }

    private void OnCreated(object sender, FileSystemEventArgs e)
    {
        try
        {
            var parentPath = Path.GetDirectoryName(e.FullPath) ?? string.Empty;
            var rootPath = GetWatcherRootPath(sender);
            
            MarkDirectoryDirty(rootPath, parentPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error handling created event for: {Path}", e.FullPath);
        }
    }

    private void OnDeleted(object sender, FileSystemEventArgs e)
    {
        try
        {
            var parentPath = Path.GetDirectoryName(e.FullPath) ?? string.Empty;
            var rootPath = GetWatcherRootPath(sender);
            
            MarkDirectoryDirty(rootPath, parentPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error handling deleted event for: {Path}", e.FullPath);
        }
    }

    private void OnRenamed(object sender, RenamedEventArgs e)
    {
        try
        {
            var parentPath = Path.GetDirectoryName(e.FullPath) ?? string.Empty;
            var rootPath = GetWatcherRootPath(sender);
            
            MarkDirectoryDirty(rootPath, parentPath);

            var oldParent = Path.GetDirectoryName(e.OldFullPath) ?? string.Empty;
            if (!string.Equals(oldParent, parentPath, StringComparison.OrdinalIgnoreCase))
            {
                MarkDirectoryDirty(rootPath, oldParent);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error handling renamed event for: {Path}", e.FullPath);
        }
    }

    private void OnError(object sender, ErrorEventArgs e)
    {
        var exception = e.GetException();
        logger.LogError(exception, "FileSystemWatcher error");
    }

    private static string GetWatcherRootPath(object sender)
    {
        if (sender is FileSystemWatcher watcher)
        {
            return watcher.Path;
        }
        return string.Empty;
    }

    private void MarkDirectoryDirty(string rootPath, string? directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath)) return;

        var key = $"{rootPath}|{directoryPath}";
        if (_directoryDebounceTokens.TryGetValue(key, out var existingCts))
        {
            existingCts.Cancel();
            existingCts.Dispose();
        }

        var cts = new CancellationTokenSource();
        _directoryDebounceTokens[key] = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(DirectoryDebounceMs, cts.Token);
                if (!cts.Token.IsCancellationRequested)
                {
                    _directoryDebounceTokens.TryRemove(key, out _);
                    DirectoryDirty?.Invoke(rootPath, directoryPath);
                    logger.LogDebug("Directory dirty (debounced): {Dir}", directoryPath);
                }
            }
            catch (OperationCanceledException)
            {
                // ignore
            }
            finally
            {
                cts.Dispose();
            }
        }, cts.Token);
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    private void Dispose(bool disposing)
    {
        if (_disposed) return;

        if (disposing)
        {
            foreach (var (_, cts) in _directoryDebounceTokens)
            {
                cts.Cancel();
                cts.Dispose();
            }
            _directoryDebounceTokens.Clear();
            foreach (var (path, watcher) in _watchers)
            {
                try
                {
                    watcher.EnableRaisingEvents = false;
                    watcher.Dispose();
                    logger.LogDebug("Disposed watcher for: {Path}", path);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error disposing watcher for: {Path}", path);
                }
            }
            _watchers.Clear();
        }

        _disposed = true;
    }
}