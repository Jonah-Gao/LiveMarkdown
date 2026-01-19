using System.Text.Json;
using System.Text.Json.Serialization;
using kernel.Hubs;
using kernel.Services;
using kernel.Utils;

// Application entry point and configuration.
// - Configures minimal web app, CORS and SignalR hubs
// - Sets up console logging with timestamps and colours
// - Maps SignalR hub endpoints

var builder = WebApplication.CreateBuilder(args);

// Controllers JSON (only affects MVC)
builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    });

// SignalR JSON (affects hub payloads)
builder.Services
    .AddSignalR()
    .AddJsonProtocol(o =>
    {
        o.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.PayloadSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
        o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    });

// Configure console logging with timestamps and colors
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    options.SingleLine = false;
    options.TimestampFormat = "[HH:mm:ss] ";
    options.ColorBehavior = Microsoft.Extensions.Logging.Console.LoggerColorBehavior.Enabled;
    options.IncludeScopes = true;
});

builder.Logging.SetMinimumLevel(LogLevel.Information);

// Configure CORS for frontend development
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

// Register services
builder.Services.AddSingleton<TerminalService>();
builder.Services.AddSingleton<PythonVenvRunner>();
builder.Services.AddSingleton<FileService>();
builder.Services.AddSingleton<FileWatcherService>();
builder.Services.AddSignalR().AddJsonProtocol();

var app = builder.Build();

// Log startup information
app.Logger.LogInformation("Starting kernel service (PID: {Pid})", LogFormatter.ToYellow(Environment.ProcessId));
app.Logger.LogInformation("Environment: {Env}", LogFormatter.ToGreen(builder.Environment.EnvironmentName));

app.UseCors();
app.UseRouting();

// Map SignalR hubs
app.MapHub<PythonHub>("/kernelHub");
app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/kernelHub"), LogFormatter.ToCyan("PythonHub"));
app.MapHub<TerminalHub>("/terminalHub");
app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/terminalHub"), LogFormatter.ToCyan("TerminalHub"));
app.MapHub<FileHub>("/fileHub");
app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/fileHub"), LogFormatter.ToCyan("FileHub"));

// Run application with error handling
try
{
    app.Run();
}
catch (Exception ex)
{
    app.Logger.LogCritical(ex, "Host terminated unexpectedly");
    throw;
}