namespace kernel.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
public class KernelHub : Hub
{
    // 前端调用执行代码
    public async Task ExecuteCode(string code)
    {
        // 模拟执行过程
        for (int i = 1; i <= 5; i++)
        {
            await Clients.Caller.SendAsync("ReceiveOutput", $"Output line {i}");
            await Task.Delay(500); // 模拟延时
        }

        await Clients.Caller.SendAsync("ExecutionComplete");
    }
}