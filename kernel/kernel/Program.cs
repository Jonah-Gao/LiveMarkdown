using kernel.Hubs;

var builder = WebApplication.CreateBuilder(args);

// builder.Logging.ClearProviders();
builder.Logging.AddConsole();

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

builder.Services.AddSignalR();

var app = builder.Build();


app.UseCors();
app.UseRouting();
app.MapHub<KernelHub>("/kernelHub");
app.MapHub<MarkdownHub>("/mdHub");
app.MapHub<TerminalHub>("/terminalHub");

app.Run();