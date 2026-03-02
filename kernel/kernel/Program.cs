using System.Text.Json;
using System.Text.Json.Serialization;
using kernel.Hubs;
using kernel.Services;
using kernel.Utils;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

// Application entry point and configuration.
// - Configures minimal web app, CORS and SignalR hubs
// - Sets up console logging with timestamps and colors
// - Maps SignalR hub endpoints

var builder = WebApplication.CreateBuilder(args);

// If no URL is configured, bind Kestrel to an ephemeral local port.
var urlsConfigured = builder.Configuration["urls"] ?? builder.Configuration["ASPNETCORE_URLS"];
if (string.IsNullOrWhiteSpace(urlsConfigured))
{
    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Listen(System.Net.IPAddress.Loopback, 0);
    });
}

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
        policy.SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrEmpty(origin))
                    return false;

                return Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback;
            })
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

var app = builder.Build();

app.UseCors();
app.UseRouting();

// Map SignalR hubs
app.MapHub<PythonHub>("/pythonHub");
app.MapHub<TerminalHub>("/terminalHub");
app.MapHub<FileHub>("/fileHub");

// Run application with error handling
try
{
    await app.StartAsync();

    var server = app.Services.GetRequiredService<IServer>();
    var addresses = server.Features.Get<IServerAddressesFeature>()!.Addresses;

    foreach (var address in addresses)
    {
        var port = new Uri(address).Port;
        Console.Out.WriteLine($"SIGNALR_PORT={port}");
        Console.Out.Flush();
        app.Logger.LogInformation("Listening on {Address}", LogFormatter.ToGreen(address));
    }
    
    app.Logger.LogInformation("Starting kernel service (PID: {Pid})", LogFormatter.ToYellow(Environment.ProcessId));
    app.Logger.LogInformation("Environment: {Env}", LogFormatter.ToGreen(builder.Environment.EnvironmentName));
    
    app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/kernelHub"), LogFormatter.ToCyan("PythonHub"));
    app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/terminalHub"), LogFormatter.ToCyan("TerminalHub"));
    app.Logger.LogInformation("Mapped hub: {Path} -> {Hub}", LogFormatter.ToMagenta("/fileHub"), LogFormatter.ToCyan("FileHub"));

    await app.WaitForShutdownAsync();
}
catch (Exception ex)
{
    app.Logger.LogCritical(ex, "Host terminated unexpectedly");
    throw;
}