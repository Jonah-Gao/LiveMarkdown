/**
 * The Preprocessor class normalizes the input Markdown string before tokenization.
 * This ensures consistent behavior across different operating systems and environments.
 */
class Preprocessor {
    private newlinesPattern = /\r\n|\r|\n/g;

    /**
     * Preprocesses the input string.
     * Normalizes line endings to `\n` and trims empty lines from start and end.
     * @param input The raw Markdown string.
     * @returns The normalized string.
     */
    preprocess(input: string): string {
        // Normalize newlines to \n
        let normalized = input.replace(this.newlinesPattern, '\n');

        // Remove leading and trailing empty lines and replace null characters with U+FFFD
        normalized = normalized.replace(/^\n+/, '')
            .replace(/\n+$/, '')
            .replace(/\x00/g, "\uFFFD");

        return normalized;
    }
}

export {Preprocessor};