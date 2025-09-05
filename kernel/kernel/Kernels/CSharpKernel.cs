namespace Electron_Text_Editor.Kernels;

using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;

public class CSharpKernel
{
    public async Task<string> ExecuteAsync(string code)
    {
        try
        {
            var result = await CSharpScript.EvaluateAsync(code, ScriptOptions.Default);
            return result?.ToString() ?? "null";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }
}