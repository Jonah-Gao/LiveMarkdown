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

    public IAsyncEnumerable<FileService.TabChunk> StreamTabAsync(string fileName, string filePath)
    {
        logger.LogInformation("Creating tab for file: {FilePath}", LogFormatter.ToGreen(filePath));
        return fileService.StreamTabAsync(fileName, filePath);
    }

    public IAsyncEnumerable<FileService.FileNode> QuickScanAsync(string dirPath, int maxDepth = 1)
    {
        logger.LogDebug("Quick scanning directory: {DirPath}", LogFormatter.ToGreen(dirPath));
        return fileService.QuickScanAsync(dirPath, maxDepth);
    }

    public IAsyncEnumerable<FileService.FileIndexEntry> DeepIndexAsync(string dirPath)
    {
        logger.LogInformation("Starting deep index for: {DirPath}", LogFormatter.ToGreen(dirPath));
        return fileService.DeepIndexAsync(dirPath);
    }
}