import {ListItemToken, Token, TokenType} from './types.ts';

/**
 * The Lexer class is responsible for converting the raw Markdown string into a stream of tokens.
 * It uses regular expressions to identify block-level and inline-level elements.
 */
class Lexer {
    /**
     * Rules for block-level elements (headings, lists, code blocks, etc.).
     * Order matters: rules are matched sequentially.
     */

    private containerBlockRules: Array<[TokenType, RegExp]> = [
        [TokenType.BLOCKQUOTE, /^ {0,3}>\s?/],
        [TokenType.LIST, /^( {0,3})([-*+])(?: {1,4}|\t|$)[\s\S]+?(?:\n{2,}(?! )(?!\1[-*+])|\n+(?=\1\d{1,9}[.)])|\n*$)/],
        [TokenType.LIST, /^( {0,3})(\d{1,9}[.)])(?: {1,4}|\t|$)[\s\S]+?(?:\n{2,}(?! )(?!\1\d{1,9}[.)])|\n+(?=\1[-*+])|\n*$)/],
    ];

    private leafBlockRules: Array<[TokenType, RegExp]> = [
        [TokenType.CODE_BLOCK, /^( {0,3})(`{3,}) *([^\s`]+)?\n?/],
        [TokenType.HR, /^ {0,3}((_ *){3,}|(- *){3,}|(\* *){3,})(?:\n|$)/],
        [TokenType.HEADING, /^(#{1,6})\s/],
        // [TokenType.PARAGRAPHBREAK, /^(\n{2,})/],
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

    /**
     * Tokenizes the input string into an array of tokens.
     * This is the main entry point for the Lexer.
     * @param input The raw Markdown string.
     * @returns An array of tokens.
     */
    tokenize(input: string): Token[] {
        const tokens: Token[] = [];

        while (input.length > 0) {
            for (const [type, regex] of [...this.containerBlockRules, ...this.leafBlockRules]) {
                const match: RegExpMatchArray | null = input.match(regex);
                if (match) {
                    input = input.slice(match[0].length);
                    const [token, length] = this.createToken(type, match, input);
                    tokens.push(token);
                    input = input.slice(length);
                    break;
                }
            }
            let [token, length] = this.createToken(TokenType.PARAGRAPH, null, input);
            tokens.push(token);
            input = input.slice(length);
        }

        return tokens;
    }

    private parseLeafBlock(input: string): [tokens: Token[], length: number] {
        const tokens: Token[] = [];
        let totalLength: number = 0;

        while (input.length > 0) {
            for (const [type, regex] of this.leafBlockRules) {
                const match: RegExpMatchArray | null = input.match(regex);
                if (match) {
                    input = input.slice(match[0].length);
                    let [token, length] = this.createToken(type, match, input);
                    tokens.push(token);
                    input = input.slice(length);
                    totalLength += match[0].length + length;
                    break;
                }
            }
            let [token, length] = this.createToken(TokenType.PARAGRAPH, null, input);
            tokens.push(token);
            input = input.slice(length);
            totalLength += length;
        }
        return [tokens, totalLength];
    }

    private parseCodeBlock(input: string, indent: number, length: number): [result: string, length: number] {
        let lines: string[] = []
        let idx: number = 0
        const regex = new RegExp(`^ {0,3}\`{${length}}\\s*\\n?$`);

        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);
            let leadingSpaces = 0;

            // closing fence: 最多 3 个空格 + ``` + 可选空白 + 换行
            if (regex.test(line)) {
                idx = end;
                break;
            }

            while (leadingSpaces < line.length && line[leadingSpaces] === ' ') leadingSpaces++;
            lines.push(line.slice(Math.min(leadingSpaces, indent)));
            idx = end;
        }
        let code: string = lines.join('');
        // Remove the trailing newline if it exists
        if (code.endsWith('\n')) {
            code = code.slice(0, -1);
        }
        return [code, idx];
    }

    private parseHeading(input: string): [result: string, length: number] {
        const lineEnd: number = input.indexOf('\n');
        const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
        const line: string = input.slice(0, end)
        return [line.trim(), end];
    }


    private parseParagraph(input: string): [result: string, length: number] {
        let lines: string[] = [];
        let idx: number = 0;
        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);

            let isBlockElement: boolean = false;
            for (const [_, regex] of [...this.containerBlockRules, ...this.leafBlockRules]) {
                if (regex.test(line)) {
                    isBlockElement = true;
                    break;
                }
            }

            // Stop if we hit a block element (but not on first line)
            if (isBlockElement && lines.length > 0) {
                break;
            }

            // Stop on blank line (paragraph break)
            if (/^\s*\n?$/.test(line) && lines.length > 0) {
                break;
            }

            lines.push(line);
            idx = end;

            // Stop if this is the first line and it's a block element
            if (isBlockElement && lines.length === 1) {
                break;
            }
        }

        return [lines.join('').trim(), idx];
    }

    private parseBlockquote(input: string): [result: Token[], length: number] {
        let result: Token[] = [];
        let idx: number = 0;
        let explicits: string[] = [];

        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);

            // empty line, stop blockquote
            if (/^\s*\n?$/.test(line)) {
                break;
            }

            const explicit = line.match(/^\s{0,3}>\s?(.*)\n?$/);
            if (explicit) {
                explicits.push(explicit[1] + '\n');
            } else if (idx === 0) {
                explicits.push(line);
            } else {
                result.push(...this.parseLeafBlock(explicits.join(''))[0]);
                explicits = [];
                const parsedLine: Token[] = this.parseLeafBlock(line)[0];
                if (parsedLine[0].type == TokenType.PARAGRAPH && result[result.length - 1].type == TokenType.PARAGRAPH) {
                    // Merge with previous paragraph
                    const prevParagraph = result[result.length - 1];
                    prevParagraph.raw += parsedLine[0].raw;
                    prevParagraph.text = (prevParagraph.text || '') + (parsedLine[0].text || '');
                    prevParagraph.tokens = this.parseInline(prevParagraph.raw);
                } else {
                    break;
                }
            }
            idx = end;
        }

        if (explicits.length > 0) {
            result.push(...this.parseLeafBlock(explicits.join(''))[0]);
        }

        return [result, idx];
    }

    /**
     * Parses inline content within a block.
     * @param raw The raw string containing inline elements.
     * @returns An array of inline tokens.
     */
    private parseInline(raw: string): Token[] {
        const tokens: Token[] = [];
        let remaining: string = raw;
        let plainTextBuffer: string[] = [];

        while (remaining.length > 0) {
            let matched: boolean = false;

            for (const [type, regex] of this.inlineRules) {
                const match: RegExpMatchArray | null = remaining.match(regex);
                if (match && match.index === 0) {
                    // Flush plain text buffer before adding new token
                    if (plainTextBuffer.length > 0) {
                        tokens.push({
                            type: TokenType.TEXT,
                            raw: plainTextBuffer.join(''),
                            text: plainTextBuffer.join(''),
                        });
                        plainTextBuffer = [];
                    }
                    tokens.push(this.createToken(type, match)[0]);
                    remaining = remaining.slice(match[0].length);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                plainTextBuffer.push(remaining.charAt(0));
                remaining = remaining.slice(1);
            }
        }
        // Flush any remaining plain text
        if (plainTextBuffer.length > 0) {
            tokens.push({
                type: TokenType.TEXT,
                raw: plainTextBuffer.join(''),
                text: plainTextBuffer.join(''),
            });
        }
        return tokens;
    }

    /**
     * Finds the index of the next special character that could trigger an inline rule.
     * Used to optimize text parsing by skipping over plain text.
     * @param text The text to search.
     * @returns The index of the next special character, or the length of the string if none found.
     */

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
     * @param input The raw Markdown string.
     * @returns The created Token.
     */
    private createToken(type: TokenType, match: RegExpMatchArray | null, input: string = ''): [token: Token, length: number] {
        const raw: string = match ? match[0] : '';
        let [result, length]: [string | Token[], number] = ['', 0];
        switch (type) {
            case TokenType.HEADING:
                [result, length] = this.parseHeading(input);
                return [{
                    type,
                    raw,
                    text: result,
                    depth: match![1].length as 1 | 2 | 3 | 4 | 5 | 6,
                    tokens: this.parseInline(result),
                }, length];
            case TokenType.CODE_BLOCK:
                [result, length] = this.parseCodeBlock(input, match![1].length, match![2].length);
                return [{
                    type,
                    raw,
                    text: result,
                    lang: match![3] || 'text',
                }, length];
            case TokenType.CODE_INLINE:
                return [{
                    type,
                    raw,
                    text: match![1],
                }, 0];
            case TokenType.BOLD:
            case TokenType.ITALIC:
                return [{
                    type,
                    raw,
                    text: match![1],
                    tokens: this.parseInline(match![1]),
                }, 0];
            case TokenType.LINK:
                return [{
                    type,
                    raw,
                    text: match![1],
                    href: match![2],
                    tokens: this.parseInline(match![1]),
                }, 0];
            case TokenType.IMAGE:
                return [{
                    type,
                    raw,
                    text: match![1],
                    href: match![2],
                    alt: match![1],
                }, 0];
            case TokenType.PARAGRAPH:
                [result, length] = this.parseParagraph(input)
                return [{
                    type,
                    raw,
                    text: result,
                    tokens: this.parseInline(result),
                }, length];
            case TokenType.BLOCKQUOTE:
                [result, length] = this.parseBlockquote(input)
                return [{
                    type,
                    raw,
                    text: '',
                    tokens: result,
                }, length];
            case TokenType.LIST:
                return [this.parseList(match!), 0];

            case TokenType.NEWLINE:
            case TokenType.SOFTBREAK:
            case TokenType.HARDBREAK:
            case TokenType.PARAGRAPHBREAK:
            case TokenType.HR:
                return [{
                    type,
                    raw,
                }, 0];
            default:
                return [{
                    type: TokenType.TEXT,
                    raw: raw,
                    text: raw,
                }, 0];
        }
    }
}

const lexer = new Lexer();
lexer.tokenize("abcd\ngg");
export {Lexer};