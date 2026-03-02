/**
 * The Preprocessor class normalizes the input Markdown string before tokenization.
 * This ensures consistent behavior across different operating systems and environments.
 */
class Preprocessor {
    private newlinesPattern = /\r\n|\r|\n/g;
    private tabPattern = /\t/g;

    /**
     * Preprocesses the input string.
     * Normalizes line endings to `\n` and trims empty lines from start and end.
     * @param input The raw Markdown string.
     * @returns The normalized string.
     */
    preprocess(input: string): string {
        // Normalize newlines to \n
        // Remove leading and trailing empty lines and replace null characters with U+FFFD
        return input.replace(this.newlinesPattern, '\n')
            .replace(this.tabPattern, '    ')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '')
            .replace(/\x00/g, "\uFFFD");
    }
}

export {Preprocessor};