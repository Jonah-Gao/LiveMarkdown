namespace kernel.Utils;

public static class LogFormatter
{
    private const string Reset = "\u001b[0m";
    private const string Red = "\u001b[31m";
    private const string Green = "\u001b[32m";
    private const string Yellow = "\u001b[33m";
    private const string Blue = "\u001b[34m";
    private const string Magenta = "\u001b[35m";
    private const string Cyan = "\u001b[36m";
    private const string White = "\u001b[37m";
    private const string BrightRed = "\u001b[91m";
    private const string BrightGreen = "\u001b[92m";
    private const string BrightYellow = "\u001b[93m";
    private const string BrightBlue = "\u001b[94m";
    private const string BrightMagenta = "\u001b[95m";
    private const string BrightCyan = "\u001b[96m";

    public static string ToRed(object value) => $"{Red}{value}{Reset}";
    public static string ToGreen(object value) => $"{Green}{value}{Reset}";
    public static string ToYellow(object value) => $"{Yellow}{value}{Reset}";
    public static string ToBlue(object value) => $"{Blue}{value}{Reset}";
    public static string ToMagenta(object value) => $"{Magenta}{value}{Reset}";
    public static string ToCyan(object value) => $"{Cyan}{value}{Reset}";
    
    public static string ToBrightRed(object value) => $"{BrightRed}{value}{Reset}";
    public static string ToBrightGreen(object value) => $"{BrightGreen}{value}{Reset}";
    public static string ToBrightYellow(object value) => $"{BrightYellow}{value}{Reset}";
    public static string ToBrightBlue(object value) => $"{BrightBlue}{value}{Reset}";
    public static string ToBrightMagenta(object value) => $"{BrightMagenta}{value}{Reset}";
    public static string ToBrightCyan(object value) => $"{BrightCyan}{value}{Reset}";
}

