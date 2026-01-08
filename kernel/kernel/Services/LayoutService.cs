using System.Text.Json;
using kernel.Utils;

namespace kernel.Services;

public class PanelLayout
{
    public double ExplorerWidth { get; set; } = 240;
    public double TerminalHeight { get; set; } = 250;
    public double EditorPreviewRatio { get; set; } = 0.5;
    public string PreferredViewMode { get; set; } = "split";
}

public class LayoutService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true
    };

    private readonly ILogger<LayoutService> _logger;
    private readonly string _layoutDirectory;
    private readonly string _layoutFilePath;

    public LayoutService(ILogger<LayoutService> logger)
    {
        _logger = logger;
        _layoutDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MarkdownKernel");
        _layoutFilePath = Path.Combine(_layoutDirectory, "layout.json");
    }

    public async Task<PanelLayout> LoadAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (!File.Exists(_layoutFilePath))
            {
                _logger.LogInformation("Layout file not found, using defaults at {Path}", LogFormatter.ToYellow(_layoutFilePath));
                return new PanelLayout();
            }

            await using var stream = File.OpenRead(_layoutFilePath);
            var layout = await JsonSerializer.DeserializeAsync<PanelLayout>(stream, SerializerOptions, cancellationToken);
            return Sanitize(layout);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load layout from {Path}", LogFormatter.ToYellow(_layoutFilePath));
            return new PanelLayout();
        }
    }

    public async Task SaveAsync(PanelLayout layout, CancellationToken cancellationToken = default)
    {
        var sanitized = Sanitize(layout);

        try
        {
            Directory.CreateDirectory(_layoutDirectory);
            await using var stream = File.Create(_layoutFilePath);
            await JsonSerializer.SerializeAsync(stream, sanitized, SerializerOptions, cancellationToken);
            _logger.LogInformation("Saved layout to {Path}", LogFormatter.ToGreen(_layoutFilePath));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save layout to {Path}", LogFormatter.ToBrightRed(_layoutFilePath));
        }
    }

    private static PanelLayout Sanitize(PanelLayout? layout)
    {
        var sanitized = layout ?? new PanelLayout();

        sanitized.ExplorerWidth = Math.Clamp(sanitized.ExplorerWidth, 140, 640);
        sanitized.TerminalHeight = Math.Clamp(sanitized.TerminalHeight, 150, 900);
        sanitized.EditorPreviewRatio = Math.Clamp(sanitized.EditorPreviewRatio, 0.1, 0.9);
        sanitized.PreferredViewMode = NormalizeViewMode(sanitized.PreferredViewMode);

        return sanitized;
    }

    private static string NormalizeViewMode(string? mode)
    {
        return mode?.ToLowerInvariant() switch
        {
            "code" => "code",
            "preview" => "preview",
            _ => "split"
        };
    }
}
