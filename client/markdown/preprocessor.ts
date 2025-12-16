class Preprocessor {
    private newlinesPattern = /\r\n|\r|\n/g;

    preprocess(input: string): string {
        // 统一换行符为 \n
        return input.replace(this.newlinesPattern, '\n');
    }
}

export {Preprocessor};