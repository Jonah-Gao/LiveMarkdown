import {ListItemToken, Token, TokenType} from './types.ts';

/**
 * The Lexer class is responsible for converting the raw markdown string into a stream of tokens.
 * It uses regular expressions to identify block-level and inline-level elements.
 */
class Lexer {
    /**
     * Rules for block-level elements (headings, lists, code blocks, etc.).
     * Order matters: rules are matched sequentially.
     */
    private blockRules: Array<[TokenType, RegExp]> = [
        [TokenType.CODE_BLOCK, /^```(\w*)\n([\s\S]*?)\n*```$/m],
        [TokenType.INDENTED_CODE_BLOCK, /^( {4}|\t)(.+)(\n|$)/],
        [TokenType.HEADING, /^(#{1,6})\s+(.+)$/m],
        [TokenType.HR, /^ {0,3}(_{3,}|-{3,}|\*{3,})$/m],
        [TokenType.BLOCKQUOTE, /^>\s+(.+)$/m],
        [TokenType.LIST, /^( {0,3})([-*+])(?: {1,4}|\t|$)[\s\S]+?(?:\n{2,}(?! )(?!\1[-*+])|\n+(?=\1\d{1,9}[.)])|\n*$)/],
        [TokenType.LIST, /^( {0,3})(\d{1,9}[.)])(?: {1,4}|\t|$)[\s\S]+?(?:\n{2,}(?! )(?!\1\d{1,9}[.)])|\n+(?=\1[-*+])|\n*$)/],
        [TokenType.PARAGRAPHBREAK, /^(\n{2,})/],
        [TokenType.NEWLINE, /^(\n)/],
        [TokenType.PARAGRAPH, /^([\s\S]+?)(?=\n{2,}|\n\s*(?:#{1,6}\s|>|```|[-*+]\s|\d+[.)]\s)| {4}.+|\t.+|$)/]
    ];

    /**
     * Rules for inline elements (bold, italic, links, etc.).
     */
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

    private itemStartRegex: RegExp = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;

    private specialChars: RegExp = /[#`*_\[\]!\->+\n\\]/;

    /**
     * Tokenizes the input string into an array of tokens.
     * This is the main entry point for the Lexer.
     * @param input The raw markdown string.
     * @returns An array of tokens.
     */
    tokenize(input: string): Token[] {
        const tokens: Token[] = [];
        let remaining: string = input;

        while (remaining.length > 0) {
            for (const [type, regex] of this.blockRules) {
                const match: RegExpMatchArray | null = remaining.match(regex);
                if (match && match.index === 0) {
                    if (type !== TokenType.INDENTED_CODE_BLOCK) {
                        tokens.push(this.createToken(type, match));
                        remaining = remaining.slice(match[0].length);
                        break;
                    } else {
                        let lines: string[] = [];
                        lines.push(match[2]); // first line of indent code block
                        remaining = remaining.slice(match[0].length);

                        while (remaining.length > 0) {
                            const indentLine = remaining.match(/^( {4}|\t)(.*?)(\n|$)/);

                            if (indentLine) {
                                // indent line
                                lines.push(indentLine[2]);
                                remaining = remaining.slice(indentLine[0].length);
                            } else if (remaining.startsWith('\n')) {
                                // empty line, check if more indent lines follow
                                const emptyLineMatch: RegExpMatchArray | null = remaining.match(/^(\n+)/);
                                const emptyLineCount: number = emptyLineMatch ? emptyLineMatch[0].length : 0;
                                const afterEmpty: string = remaining.slice(emptyLineCount);
                                const hasMoreIndent: boolean = /^(( {4}|\t)(.+)(\n|$))/.test(afterEmpty);
                                if (hasMoreIndent) {
                                    // indent lines after empty lines
                                    for (let i: number = 0; i < emptyLineCount; i++) {
                                        lines.push('');
                                    }
                                    remaining = afterEmpty;
                                } else {
                                    // no more indent lines, end of code block
                                    break;
                                }
                            } else {
                                // not an indent line or empty line, end of code block
                                break;
                            }
                        }

                        const rawCodeBlock = lines.join('\n');
                        tokens.push({
                            type: TokenType.CODE_BLOCK,
                            raw: rawCodeBlock,
                            text: rawCodeBlock,
                            lang: 'text',
                        });
                    }
                }
            }
        }

        return tokens;
    }

    /**
     * Parses inline content within a block.
     * @param raw The raw string containing inline elements.
     * @returns An array of inline tokens.
     */
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
                // Handle plain text
                const nextSpecial = this.findNextSpecial(remaining);
                tokens.push({type: TokenType.TEXT, raw: remaining.slice(0, nextSpecial)});
                remaining = remaining.slice(nextSpecial);
            }
        }
        return tokens;
    }

    /**
     * Finds the index of the next special character that could trigger an inline rule.
     * Used to optimize text parsing by skipping over plain text.
     * @param text The text to search.
     * @returns The index of the next special character, or the length of the string if none found.
     */
    private findNextSpecial(text: string): number {
        const match: number = text.slice(1).search(this.specialChars);

        if (match === -1) {
            return text.length; // No special characters, return all
        }

        return match + 1; // +1 because we search from slice(1)
    }

    /**
     * Parses a list block.
     * Handles nested lists, loose/tight lists, and ordered/unordered lists.
     * @param match The regex match result for the list.
     * @returns A ListToken containing ListItemTokens.
     */
    private parseList(match: RegExpMatchArray): Token {
        const raw: string = match[0];
        const bull: string = match[2];
        const ordered: boolean = bull.length > 1 && (bull.endsWith('.') || bull.endsWith(')'));
        let start: number | undefined;

        if (ordered) {
            start = parseInt(bull, 10);
        }

        const lines: string[] = raw.split('\n');
        // Remove trailing newline if it exists
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        const itemsRaw: string[][] = [];
        let currentItemLines: string[] = [];
        let currentContentIndent = 0;

        for (let i: number = 0; i < lines.length; i++) {
            const line: string = lines[i];
            const m: RegExpMatchArray | null = line.match(this.itemStartRegex);

            let isNewItem: boolean = false;
            if (m) {
                const indent: number = m[1].length;
                if (itemsRaw.length === 0 && currentItemLines.length === 0) {
                    isNewItem = true;
                } else if (indent < currentContentIndent) {
                    isNewItem = true;
                }
            }

            if (isNewItem) {
                if (currentItemLines.length > 0) {
                    itemsRaw.push(currentItemLines);
                }
                currentItemLines = [line];
                if (m) {
                    currentContentIndent = m[0].length;
                }
            } else {
                currentItemLines.push(line);
            }
        }

        if (currentItemLines.length > 0) {
            itemsRaw.push(currentItemLines);
        }

        let loose: boolean = false;

        for (let i: number = 0; i < itemsRaw.length - 1; i++) {
            const itemLines: string[] = itemsRaw[i];
            if (itemLines.length > 0 && itemLines[itemLines.length - 1].trim() === '') {
                loose = true;
                break;
            }
        }

        const items: Token[] = [];
        for (const itemLines of itemsRaw) {
            const item: Token = this.createListItem(itemLines);
            items.push(item);
            if (!loose && (item as ListItemToken).loose) {
                loose = true;
            }
        }

        if (loose) {
            for (const item of items) {
                (item as any).loose = true;
            }
        }

        return {
            type: TokenType.LIST,
            raw: raw,
            ordered: ordered,
            start: start,
            loose: loose,
            tokens: items
        };
    }

    /**
     * Creates a list item token from a block of lines.
     * Handles indentation stripping and recursion for nested content.
     * @param lines The lines belonging to this list item.
     * @returns A ListItemToken.
     */
    private createListItem(lines: string[]): Token {
        const raw: string = lines.join('\n');
        const firstLine: string = lines[0];
        const m: RegExpMatchArray | null = firstLine.match(this.itemStartRegex);


        let content: string;
        let indent: number = 0;
        let stripLen: number = 0;

        if (m) {
            indent = m[1].length;
            stripLen = m[0].length;
            content = firstLine.substring(stripLen);
        } else {
            content = firstLine;
        }

        for (let i: number = 1; i < lines.length; i++) {
            const line: string = lines[i];
            const matchSpace: RegExpMatchArray | null = line.match(new RegExp(`^[ \\t]{0,${stripLen}}`));
            const stripped: string = matchSpace ? line.substring(matchSpace[0].length) : line;
            content += '\n' + stripped;
        }

        const isLoose: boolean = /\n\n/.test(content);

        return {
            type: TokenType.LIST_ITEM,
            raw: raw,
            indent: indent,
            loose: isLoose,
            tokens: this.tokenize(content)
        };
    }

    /**
     * Factory method to create tokens based on type and regex match.
     * @param type The type of token to create.
     * @param match The regex match result.
     * @returns The created Token.
     */
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
            case TokenType.LIST:
                return this.parseList(match);

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