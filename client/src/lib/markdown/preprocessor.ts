/**
 * The Preprocessor class is responsible for normalizing the input markdown string before tokenization.
 * This ensures consistent behavior across different operating systems and environments.
 */
class Preprocessor {
    private newlinesPattern = /\r\n|\r|\n/g;

    /**
     * Preprocesses the input string.
     * Currently, it normalizes all line endings to `\n`.
     * @param input The raw markdown string.
     * @returns The normalized string.
     */
    preprocess(input: string): string {
        // Normalize newlines to \n
        return input.replace(this.newlinesPattern, '\n');
    }
}

export {Preprocessor};