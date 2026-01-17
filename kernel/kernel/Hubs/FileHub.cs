using System.Threading.Channels;
using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

public class FileHub(FileService fileService, ILogger<FileHub> logger) : Hub
{
    public IAsyncEnumerable<FileService.FileNode> ReadDirAsync(string dirPath)
    {
        // Log directory reading at Debug level as it can be frequent during navigation
        logger.LogDebug("Reading files in directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        return fileService.ReadDirAsync(dirPath);
    }

    public IAsyncEnumerable<FileService.TabChunk> StreamTabAsync(string filePath)
    {
        logger.LogInformation("Creating tab for file: {FilePath}", LogFormatter.ToGreen(filePath));
        return fileService.StreamTabAsync(filePath);
    }

    public async Task SaveFileAsync(string filePath, ChannelReader<string> stream)
    {
        logger.LogInformation("Saving file: {FilePath}", LogFormatter.ToGreen(filePath));
        await fileService.SaveFileAsync(filePath, stream);
    }

    public async Task SaveWorkspaceSettingsAsync(string cwd, FileService.PanelLayout layout)
    {
        logger.LogInformation("Saving panel layout to: {layoutPath}", LogFormatter.ToGreen(layout.WorkingDirectory));
        await fileService.SaveWorkspaceSettingsAsync(cwd, layout);
    }

    public async Task<FileService.PanelLayout?> LoadWorkspaceSettingsAsync(string cwd)
    {
        logger.LogInformation("Loading panel layout from: {layoutPath}", LogFormatter.ToGreen(cwd));
        return await fileService.LoadWorkspaceSettingsAsync(cwd);
    }
}