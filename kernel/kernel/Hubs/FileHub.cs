using System.Runtime.CompilerServices;
using kernel.Services;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

public class FileHub : Hub
{
    private readonly ILogger<FileHub> _logger;
    private readonly FileService _fileService;

    public FileHub(FileService fileService, ILogger<FileHub> logger)
    {
        _fileService = fileService;
        _logger = logger;
    }

    public IAsyncEnumerable<FileService.FileNode> ReadDirAsync(string dirPath)
    {
        _logger.LogInformation("Reading files in directory: {DirPath}", dirPath);
        return _fileService.ReadDirAsync(dirPath);
    }

    public IAsyncEnumerable<FileService.TabChunk> StreamTabAsync(string fileName, string filePath)
    {
        _logger.LogInformation("Creating tab for file: {FilePath}", filePath);
        return _fileService.StreamTabAsync(fileName, filePath);
    }
}