using Electron_Text_Editor.Kernels;
using Microsoft.AspNetCore.Mvc;

namespace Electron_Text_Editor.Controllers;
    
[ApiController]
[Route("api/[controller]")]
public class KernelController : ControllerBase
{
    private readonly CSharpKernel _csharpKernel = new();

    [HttpPost("execute/csharp")]
    public async Task<IActionResult> ExecuteCSharp([FromBody] CodeRequest request)
    {
        var output = await _csharpKernel.ExecuteAsync(request.Code);
        return Ok(new { result = output });
    }
}


public class CodeRequest
{
    public string Code { get; set; } = "";
}