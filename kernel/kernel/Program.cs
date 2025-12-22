using kernel.Hubs;
using kernel.Services;

// Program.cs: application bootstrap
// - Configure minimal web app, CORS and SignalR hubs
// - Improve console logging format so logs include timestamps, levels and scopes
// - Add a few startup log lines to make it easier to diagnose service startup

var builder = WebApplication.CreateBuilder(args);

// Replace default providers with a simple console logger that includes timestamps
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    // Single-line output with a compact timestamp makes logs easier to read in consoles
    options.SingleLine = true;
    options.TimestampFormat = "[yyyy-MM-dd HH:mm:ss] ";
    options.IncludeScopes = true;
});
// Set a sensible default minimum level for this host
builder.Logging.SetMinimumLevel(LogLevel.Information);

// CORS: allow the frontend development origin for local dev (adjust for production)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Register services and SignalR
builder.Services.AddSingleton<TerminalService>();
builder.Services.AddSingleton<PythonVenvRunner>();
builder.Services.AddSingleton<FileService>();
builder.Services.AddSignalR();

var app = builder.Build();

// Log some helpful startup information
app.Logger.LogInformation("Starting kernel service (PID: {Pid})", Environment.ProcessId);
app.Logger.LogInformation("Environment: {Env}", builder.Environment.EnvironmentName);

app.UseCors();
app.UseRouting();

// Map SignalR hubs - log each mapping for easier debugging
app.MapHub<PythonHub>("/kernelHub");
app.Logger.LogInformation("Mapped hub: /kernelHub -> PythonHub");
app.MapHub<MarkdownHub>("/mdHub");
app.Logger.LogInformation("Mapped hub: /mdHub -> MarkdownHub");
app.MapHub<TerminalHub>("/terminalHub");
app.Logger.LogInformation("Mapped hub: /terminalHub -> TerminalHub");
app.MapHub<FileHub>("/fileHub");
app.Logger.LogInformation("Mapped hub: /fileHub -> FileHub");

// Final run with a top-level try to ensure we log unhandled shutdowns
try
{
    app.Run();
}
catch (Exception ex)
{
    app.Logger.LogCritical(ex, "Host terminated unexpectedly");
    throw;
}
