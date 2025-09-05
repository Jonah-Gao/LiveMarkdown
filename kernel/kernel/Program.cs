using kernel.Hubs;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();

var app = builder.Build();
app.UseRouting();
app.MapHub<KernelHub>("/kernelHub");

app.Run();