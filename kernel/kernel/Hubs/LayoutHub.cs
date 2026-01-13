using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.SignalR;

namespace kernel.Hubs;

public class LayoutHub(LayoutService layoutService, ILogger<LayoutHub> logger) : Hub
{
    public async Task<PanelLayout> GetLayout(CancellationToken cancellationToken = default)
    {
        var layout = await layoutService.LoadAsync(cancellationToken);
        logger.LogInformation("Restored layout: explorer {ExplorerWidth}px, terminal {TerminalHeight}px, ratio {Ratio}",
            LogFormatter.ToCyan(layout.ExplorerWidth),
            LogFormatter.ToCyan(layout.TerminalHeight),
            LogFormatter.ToCyan(layout.EditorPreviewRatio));
        return layout;
    }

    public Task SaveLayout(PanelLayout layout, CancellationToken cancellationToken = default)
    {
        return layoutService.SaveAsync(layout, cancellationToken);
    }
}