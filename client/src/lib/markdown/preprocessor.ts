/**
 * The Preprocessor class is responsible for normalizing the input markdown string before tokenization.
 * This ensures consistent behavior across different operating systems and environments.
 */
class Preprocessor {
    private newlinesPattern = /\r\n|\r|\n/g;

    /**
     * Preprocesses the input string.
     * Normalizes line endings to `\n` and trims empty lines from start and end.
     * @param input The raw markdown string.
     * @returns The normalized string.
     */
    preprocess(input: string): string {
        // Normalize newlines to \n
        let normalized = input.replace(this.newlinesPattern, '\n');
        
        // Remove leading and trailing empty lines
        normalized = normalized.replace(/^\n+/, '').replace(/\n+$/, '');
        
        return normalized;
    }
}

export {Preprocessor};