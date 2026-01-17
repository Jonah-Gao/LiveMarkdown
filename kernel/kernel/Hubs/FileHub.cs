using System.Threading.Channels;
using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

/// <summary>
/// SignalR hub for file system operations.
/// Provides streaming file tree reading, file content streaming, and workspace settings.
/// </summary>
public class FileHub(FileService fileService, ILogger<FileHub> logger) : Hub
{
    /// <summary>
    /// Read directory contents recursively and stream results.
    /// </summary>
    public IAsyncEnumerable<FileService.FileNode> ReadDirAsync(string dirPath)
    {
        logger.LogDebug("Reading files in directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        return fileService.ReadDirAsync(dirPath);
    }

    /// <summary>
    /// Stream file content for opening in a tab.
    /// </summary>
    public IAsyncEnumerable<FileService.TabChunk> StreamTabAsync(string filePath)
    {
        logger.LogInformation("Creating tab for file: {FilePath}", LogFormatter.ToGreen(filePath));
        return fileService.StreamTabAsync(filePath);
    }
    
    /// <summary>
    /// Create a new directory.
    /// </summary>
    /// <param name="dirPath"></param>
    public void CreateDirectory(string dirPath)
    {
        logger.LogInformation("Creating directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        fileService.CreateDirectory(dirPath);
    }

    /// <summary>
    /// Save file content from a stream.
    /// </summary>
    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream)
    {
        logger.LogInformation("Saving file: {FilePath}", LogFormatter.ToGreen(filePath));
        await fileService.SaveFileAsync(filePath, stream);
    }

    /// <summary>
    /// Save workspace settings to disk.
    /// </summary>
    public async Task SaveWorkspaceSettingsAsync(string cwd, FileService.PanelLayout layout)
    {
        logger.LogInformation("Saving panel layout to: {LayoutPath}", LogFormatter.ToGreen(cwd));
        await fileService.SaveWorkspaceSettingsAsync(cwd, layout);
    }

    /// <summary>
    /// Load workspace settings from disk.
    /// </summary>
    public async Task<FileService.PanelLayout?> LoadWorkspaceSettingsAsync(string cwd)
    {
        logger.LogInformation("Loading panel layout from: {LayoutPath}", LogFormatter.ToGreen(cwd));
        return await fileService.LoadWorkspaceSettingsAsync(cwd);
    }
}