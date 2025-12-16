import {Lexer} from './lexer';
import {Parser} from './parser';
import {Renderer} from './renderer';
import {Preprocessor} from "./preprocessor.ts";

class MarkdownParser {
    private preprocessor = new Preprocessor();
    private lexer = new Lexer();
    private parser = new Parser();
    private renderer = new Renderer();

    parse(input: string): string {
        const markdown = this.preprocessor.preprocess(input);
        const tokens = this.lexer.tokenize(markdown);
        const ast = this.parser.parse(tokens);
        return this.renderer.render(ast);
    }

    // 支持自定义扩展
    // extend(type: TokenType, rule: RegExp, handler: (node: ASTNode) => string) {
    //     this.lexer. addRule(type, rule);
    //     this.renderer.addHandler(type, handler);
    // }
}

// 使用示例
// const md = new MarkdownParser();
// const html = md.parse('# Hello **World**');

const md = new MarkdownParser();
const content = md.parse("\n`python`");
console.log(content);

export {MarkdownParser};