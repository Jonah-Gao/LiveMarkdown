import {Lexer} from './lexer';
import {Parser} from './parser';
import {Renderer} from './rendererVue3.ts';
import {Preprocessor} from "./preprocessor.ts";
import {VNode} from "vue";

/**
 * Main class for the Markdown parser.
 * Orchestrates the parsing process by coordinating the Preprocessor, Lexer, Parser, and Renderer.
 */
class MarkdownParser {
    private preprocessor = new Preprocessor();
    private lexer = new Lexer();
    private parser = new Parser();
    private renderer = new Renderer();

    /**
     * Converts a Markdown string into an HTML VNode.
     *
     * The process involves:
     * 1. Preprocessing: Normalizing the input (e.g., line endings).
     * 2. Tokenization (Lexing): Converting text into a stream of tokens.
     * 3. Parsing: Building an Abstract Syntax Tree (AST) from the tokens.
     * 4. Rendering: Traversing the AST to generate HTML.
     *
     * @param input The raw Markdown string.
     * @returns The generated HTML VNode.
     */
    render(input: string): VNode {
        const markdown = this.preprocessor.preprocess(input);
        const tokens = this.lexer.tokenize(markdown);
        const ast = this.parser.parse(tokens);
        return this.renderer.render(ast);
    }
}

export {MarkdownParser};