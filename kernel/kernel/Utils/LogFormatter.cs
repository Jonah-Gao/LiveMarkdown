using JetBrains.Annotations;

namespace kernel.Utils;

/// <summary>
/// Provides ANSI color formatting for console log output.
/// Used to colorize log messages for better readability.
/// </summary>
public static class LogFormatter
{
    // ANSI escape codes for colors
    private const string Reset = "\e[0m";
    private const string Red = "\e[31m";
    private const string Green = "\e[32m";
    private const string Yellow = "\e[33m";
    private const string Blue = "\e[34m";
    private const string Magenta = "\e[35m";
    private const string Cyan = "\e[36m";
    private const string White = "\e[37m";
    private const string BrightRed = "\e[91m";
    private const string BrightGreen = "\e[92m";
    private const string BrightYellow = "\e[93m";
    private const string BrightBlue = "\e[94m";
    private const string BrightMagenta = "\e[95m";
    private const string BrightCyan = "\e[96m";

    /// <summary>Format value with white color.</summary>
    [UsedImplicitly]
    public static string ToWhite(object value) => $"{White}{value}{Reset}";

    /// <summary>Format value with red color.</summary>
    [UsedImplicitly]
    public static string ToRed(object value) => $"{Red}{value}{Reset}";

    /// <summary>Format value with green color.</summary>
    [UsedImplicitly]
    public static string ToGreen(object value) => $"{Green}{value}{Reset}";

    /// <summary>Format value with yellow color.</summary>
    [UsedImplicitly]
    public static string ToYellow(object value) => $"{Yellow}{value}{Reset}";

    /// <summary>Format value with blue color.</summary>
    [UsedImplicitly]
    public static string ToBlue(object value) => $"{Blue}{value}{Reset}";

    /// <summary>Format value with magenta color.</summary>
    [UsedImplicitly]
    public static string ToMagenta(object value) => $"{Magenta}{value}{Reset}";

    /// <summary>Format value with cyan color.</summary>
    [UsedImplicitly]
    public static string ToCyan(object value) => $"{Cyan}{value}{Reset}";

    /// <summary>Format value with bright red color (for errors).</summary>
    [UsedImplicitly]
    public static string ToBrightRed(object value) => $"{BrightRed}{value}{Reset}";

    /// <summary>Format value with bright green color.</summary>
    [UsedImplicitly]
    public static string ToBrightGreen(object value) => $"{BrightGreen}{value}{Reset}";

    /// <summary>Format value with bright yellow color.</summary>
    [UsedImplicitly]
    public static string ToBrightYellow(object value) => $"{BrightYellow}{value}{Reset}";

    /// <summary>Format value with bright blue color.</summary>
    [UsedImplicitly]
    public static string ToBrightBlue(object value) => $"{BrightBlue}{value}{Reset}";

    /// <summary>Format value with bright magenta color.</summary>
    [UsedImplicitly]
    public static string ToBrightMagenta(object value) => $"{BrightMagenta}{value}{Reset}";

    /// <summary>Format value with bright cyan color.</summary>
    [UsedImplicitly]
    public static string ToBrightCyan(object value) => $"{BrightCyan}{value}{Reset}";
}