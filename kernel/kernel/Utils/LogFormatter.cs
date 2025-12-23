namespace kernel.Utils;

public static class LogFormatter
{
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
    
    public static string ToWhite(object value) => $"{White}{value}{Reset}";
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

