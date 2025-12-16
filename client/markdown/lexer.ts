import {Token, TokenType} from './types.ts';

// interface ListItem {
//     content: string;
//     indent: number;
//     ordered: boolean;
//     start?: number;
// }

class Lexer {
    private blockRules: Map<TokenType, RegExp> = new Map([
        [TokenType.PARAGRAPHBREAK, /^(\n{2,})/],
        [TokenType.NEWLINE, /^(\n)/],
        [TokenType.HEADING, /^(#{1,6})\s+(.+)$/m],
        [TokenType.CODE_BLOCK, /^```(\w*)\n([\s\S]*?)\n*```$/m],
        [TokenType.HR, /^(_{3,}|-{3,}|\*{3,})$/m],
        [TokenType.BLOCKQUOTE, /^>\s+(.+)$/m],
        [TokenType.LIST_ITEM, /^[-*+]\s+(.+)$/m],
        [TokenType.PARAGRAPH, /^([\s\S]+?)(?=\n{2,}|\n\s*(?:#{1,6}\s|>|```|[-*+]\s|\d+\.\s)|$)/]
    ]);

    private inlineRules: Map<TokenType, RegExp> = new Map([
        [TokenType.HARDBREAK, / {2,}\n/],
        [TokenType.SOFTBREAK, /\n/],
        [TokenType.CODE_INLINE, /`([^`]+)`/],
        [TokenType.BOLD_ITALIC, /\*\*\*([\s\S]+?)\*\*\*/],
        [TokenType.BOLD, /\*\*(?!\*)([\s\S]+?)\*\*(?!\*)/],
        [TokenType.ITALIC, /\*(?!\*)([\s\S]+?)\*(?!\*)/],
        [TokenType.IMAGE, /!\[([^\]]*)]\(([^)]+)\)/],
        [TokenType.LINK, /\[([^\]]+)]\(([^)]+)\)/],
    ]);
    // private listRules = {
    //     // 无序列表项:  - item 或 * item 或 + item
    //     unordered: /^( *)([-*+]) (.+)$/gm,
    //
    //     // 有序列表项: 1. item 或 1) item
    //     ordered: /^( *)(\d+)[.)]\s+(.+)$/gm,
    //
    //     // 检测列表块（连续的列表项）
    //     listBlock: /^((?: *(?:[-*+]|\d+[.)]) . +(?:\n|$))+)/m,
    // };

    private specialChars: RegExp = /[#`*_\[\]!\->+\n\\]/;

    tokenize(input: string): Token[] {
        const tokens: Token[] = [];
        let remaining: string = input;

        while (remaining.length > 0) {
            // let matched: boolean = false;

            for (const [type, regex] of this.blockRules) {
                const match: RegExpMatchArray | null = remaining.match(regex);
                if (match && match.index === 0) {
                    tokens.push(this.createToken(type, match));
                    remaining = remaining.slice(match[0].length);
                    // matched = true;
                    break;
                }
            }
        }

        return tokens;
    }

    private parseInline(raw: string): Token[] {
        const tokens: Token[] = [];
        let remaining: string = raw;

        while (remaining.length > 0) {
            let matched: boolean = false;

            for (const [type, regex] of this.inlineRules) {
                const match: RegExpMatchArray | null = remaining.match(regex);
                if (match && match.index === 0) {
                    tokens.push(this.createToken(type, match));
                    remaining = remaining.slice(match[0].length);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                // 处理普通文本
                const nextSpecial = this.findNextSpecial(remaining);
                tokens.push({type: TokenType.TEXT, raw: remaining.slice(0, nextSpecial)});
                remaining = remaining.slice(nextSpecial);
            }
        }
        return tokens;
    }

    private findNextSpecial(text: string): number {
        const match: number = text.slice(1).search(this.specialChars);

        if (match === -1) {
            return text.length; // 没有特殊字符，返回全部
        }

        return match + 1; // +1 因为我们从 slice(1) 开始搜索
    }

    private createToken(type: TokenType, match: RegExpMatchArray): Token {
        const raw: string = match[0];

        switch (type) {
            case TokenType.HEADING:
                return {
                    type,
                    raw,
                    text: match[2],
                    depth: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
                };
            case TokenType.CODE_BLOCK:
                return {
                    type,
                    raw,
                    text: match[2],
                    lang: match[1] || 'text',
                };
            case TokenType.CODE_INLINE:
                return {
                    type,
                    raw,
                    text: match[1],
                };
            case TokenType.BOLD:
            case TokenType.ITALIC:
                return {
                    type,
                    raw,
                    text: match[1],
                    tokens: this.parseInline(match[1]),
                };
            case TokenType.LINK:
                return {
                    type,
                    raw,
                    text: match[1],
                    href: match[2],
                    tokens: this.parseInline(match[1]),
                }
            case TokenType.IMAGE:
                return {
                    type,
                    raw,
                    text: match[1],
                    href: match[2],
                    alt: match[1],
                };
            case TokenType.PARAGRAPH:
            case TokenType.BLOCKQUOTE:
                return {
                    type,
                    raw,
                    text: match[1],
                    tokens: this.parseInline(match[1]),
                };
            // case TokenType.LIST_ITEM:
            //     return {
            //         type,
            //         raw,
            //         text: match[1],
            //         tokens: this.tokenize(match[1]),
            //     };

            case TokenType.NEWLINE:
            case TokenType.SOFTBREAK:
            case TokenType.HARDBREAK:
            case TokenType.PARAGRAPHBREAK:
            case TokenType.HR:
                return {
                    type,
                    raw,
                };
            default:
                return {
                    type: TokenType.TEXT,
                    raw,
                    text: raw,
                };
        }
    }
}

export {Lexer};