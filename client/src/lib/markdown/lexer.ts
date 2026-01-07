import {Token, TokenType} from './types.ts';

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
        [TokenType.ULIST, /^( {0,3})([-*+])(?: {1,4}|\t|$)/],
        [TokenType.OLIST, /^( {0,3})(\d{1,9}[.)])(?: {1,4}|\t|$)/],
    ];

    private leafBlockRules: Array<[TokenType, RegExp]> = [
        [TokenType.INDENTED_CODE_BLOCK, /^( {4,})(\S+)/],
        [TokenType.CODE_BLOCK, /^( {0,3})(`{3,}) *([^\s`]+)?(?:\n|$)/],
        [TokenType.HEADING, /^(#{1,6})\s/],
        [TokenType.HR, /^ {0,3}((_ *){3,}|(- *){3,}|(\* *){3,})(?:\n|$)/],
        // [TokenType.PARAGRAPHBREAK, /^(\n{2,})/],
    ];

    /**
     * Rules for inline elements (bold, italic, links, etc.).
     */
    private inlineRules: Array<[TokenType, RegExp]> = [
        [TokenType.HARDBREAK, / {2,}\n/],
        [TokenType.SOFTBREAK, /\n/],
        [TokenType.CODE_INLINE, /`([^`]+)`/],
        [TokenType.BOLD_ITALIC, /\*\*\*([\s\S]+?)\*\*\*/],
        [TokenType.BOLD, /\*\*(?!\*)([\s\S]+?)\*\*(?!\*)/],
        [TokenType.ITALIC, /\*(?!\*)([\s\S]+?)\*(?!\*)/],
        [TokenType.IMAGE, /!\[([^\]]*)]\(([^)]+)\)/],
        [TokenType.LINK, /\[([^\]]+)]\(([^)]+)\)/],
    ];


    /**
     * Tokenises the input string into an array of tokens.
     * This is the main entry point for the Lexer.
     * @param input The raw Markdown string.
     * @returns An array of tokens.
     */
    tokenize(input: string): Token[] {
        const tokens: Token[] = [];

        while (input.length > 0) {
            let matched: boolean = false;
            for (const [type, regex] of [...this.containerBlockRules, ...this.leafBlockRules]) {
                const match: RegExpMatchArray | null = input.match(regex);
                if (match) {
                    input = input.slice(match[0].length);
                    const [token, length] = this.createToken(type, match, input);
                    tokens.push(token);
                    input = input.slice(length);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                let [token, length] = this.createToken(TokenType.PARAGRAPH, null, input);
                tokens.push(token);
                input = input.slice(length);
            }
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

    private parseIndentedCodeBlock(input: string, firstLine: string, indent: number): [result: string, length: number] {
        let lines: string[] = [];
        let idx: number = 0;
        lines.push(firstLine);
        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);
            if (this.isEmptyLine(line)) {
                lines.push(line);
                idx = end;
                continue;
            }
            let leadingSpaces = 0;
            while (leadingSpaces < line.length && line[leadingSpaces] === ' ') leadingSpaces++;
            if (leadingSpaces >= indent) {
                lines.push(line.slice(indent));
                idx = end;
            } else {
                break;
            }
        }

        const code: string = lines.join('').trim();
        return [code, idx];
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
        // if (code.endsWith('\n')) {
        //     code = code.slice(0, -1);
        // }
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
            if (this.isEmptyLine(line) && lines.length > 0) {
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
            if (this.isEmptyLine(line)) {
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
     * Parses an unordered list using line-by-line parsing.
     * An unordered list marker is a -, +, or * character.
     * @param input The input string starting after the first list marker
     * @param initialMarker The marker character (-, +, or *)
     * @param initialIndent The indentation of the first list item
     * @param initialMarkerWidth The width of the first marker including indentation and following spaces
     * @returns [Token for the list, length consumed]
     */
    private parseUnorderedList(input: string, initialMarker: string, initialIndent: number, initialMarkerWidth: number): [result: Token, length: number] {
        const bulletMarkerRegex = new RegExp(`^ {0,3}([${initialMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}])(?: {1,4}|\\t|$)`);
        let items: Token[] = [];
        let idx: number;
        let loose: boolean = false;
        let currentItemLines: string[] = [];

        let blankLineCount: number = 0;
        let firstItemMarkerWidth: number = initialMarkerWidth;

        // Handle first line (marker already stripped by tokenizer)
        const firstLineEnd: number = input.indexOf('\n', 0);
        const firstLineIdx: number = firstLineEnd === -1 ? input.length : firstLineEnd + 1;
        const line: string = input.slice(0, firstLineIdx);
        if (initialMarker === '*' || initialMarker === '-') {
            const HR = new RegExp(`^ *(${initialMarker} *){2,}(?:\\n|$)`)
            if (HR.test(line)) {
                // It's a horizontal rule, not a list
                return [{
                    type: TokenType.HR,
                    raw: line,
                }, firstLineIdx];
            }
        }

        currentItemLines.push(line);
        idx = firstLineIdx;

        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);

            // Check for blank line
            if (this.isEmptyLine(line)) {
                if (currentItemLines.length > 0) {
                    blankLineCount++;
                    currentItemLines.push(line);
                }
                idx = end;
                continue;
            }

            // Check if this line starts a new list item
            const itemMatch = line.match(bulletMarkerRegex);

            if (itemMatch) {
                // Save previous item if exists
                if (currentItemLines.length > 0) {
                    if (blankLineCount > 0) {
                        loose = true;
                    }
                    const itemContent = currentItemLines.join('');
                    items.push(this.createListItemFromContent(itemContent, initialIndent));
                    currentItemLines = [];
                    blankLineCount = 0;
                }
                const markerWidth = itemMatch[0].length;
                const lineContent = line.substring(markerWidth);
                currentItemLines.push(lineContent);
                firstItemMarkerWidth = markerWidth;
                idx = end;
            } else {
                // Check if line belongs to current item (indented continuation)
                if (currentItemLines.length > 0) {
                    const leadingSpaces = line.match(/^ */)?.[0].length || 0;

                    // Line is part of current item if indented by at least the marker width
                    // or if it's a continuation after blank lines
                    if (leadingSpaces >= firstItemMarkerWidth || blankLineCount > 0) {
                        // Strip indentation equal to marker width
                        const stripped = line.substring(Math.min(leadingSpaces, firstItemMarkerWidth));
                        currentItemLines.push(stripped);
                        blankLineCount = 0;
                        idx = end;
                    } else {
                        // Line doesn't belong to this list
                        break;
                    }
                } else {
                    // No current item, list is done
                    break;
                }
            }
        }
        // Save last item
        if (currentItemLines.length > 0) {
            if (blankLineCount > 0) {
                loose = true;
            }
            const itemContent = currentItemLines.join('');
            items.push(this.createListItemFromContent(itemContent, initialIndent));
        }

        // Mark all items as loose if list is loose
        if (loose) {
            for (const item of items) {
                (item as any).loose = true;
            }
        }

        const raw = input.slice(0, idx);
        return [{
            type: TokenType.ULIST,
            raw: raw,
            loose: loose,
            tokens: items
        }, idx];
    }

    /**
     * Parses an ordered list using line-by-line parsing.
     * An ordered list marker is 1-9 digits followed by . or )
     * @param input The input string starting after the first list marker
     * @param initialMarker The marker string (e.g., "1.", "2)")
     * @param initialIndent The indentation of the first list item
     * @param initialMarkerWidth The width of the first marker including indentation and following spaces
     * @returns [Token for the list, length consumed]
     */
    private parseOrderedList(input: string, initialMarker: string, initialIndent: number, initialMarkerWidth: number): [result: Token, length: number] {
        const delimiter = initialMarker.slice(-1); // . or )
        const orderedMarkerRegex = new RegExp(`^ {0,3}(\\d{1,9}[${delimiter === '.' ? '\\.' : '\\)'}])(?: {1,4}|\\t|$)`);
        let items: Token[] = [];
        let idx: number;
        let loose: boolean = false;
        let currentItemLines: string[] = [];
        let blankLineCount: number = 0;
        let start: number | undefined = parseInt(initialMarker, 10);
        let firstItemMarkerWidth: number = initialMarkerWidth;

        // Handle first line (marker already stripped by tokenizer)
        const firstLineEnd: number = input.indexOf('\n', 0);
        const firstLineIdx: number = firstLineEnd === -1 ? input.length : firstLineEnd + 1;
        currentItemLines.push(input.slice(0, firstLineIdx));
        idx = firstLineIdx;

        while (idx < input.length) {
            const lineEnd: number = input.indexOf('\n', idx);
            const end: number = lineEnd === -1 ? input.length : lineEnd + 1;
            const line: string = input.slice(idx, end);

            // Check for blank line
            if (this.isEmptyLine(line)) {
                if (currentItemLines.length > 0) {
                    blankLineCount++;
                    currentItemLines.push(line);
                }
                idx = end;
                continue;
            }

            // Check if this line starts a new list item
            const itemMatch = line.match(orderedMarkerRegex);

            if (itemMatch) {
                // Save previous item if exists
                if (currentItemLines.length > 0) {
                    if (blankLineCount > 0) {
                        loose = true;
                    }
                    const itemContent = currentItemLines.join('');
                    items.push(this.createListItemFromContent(itemContent, initialIndent));
                    currentItemLines = [];
                    blankLineCount = 0;
                }

                // Start new item - strip the marker and following spaces
                const markerWidth = itemMatch[0].length;
                const lineContent = line.substring(markerWidth);
                currentItemLines.push(lineContent);
                firstItemMarkerWidth = markerWidth;
                idx = end;
            } else {
                // Check if line belongs to current item (indented continuation)
                if (currentItemLines.length > 0) {
                    const leadingSpaces = line.match(/^ */)?.[0].length || 0;

                    // Line is part of current item if indented by at least the marker width
                    // or if it's a continuation after blank lines
                    if (leadingSpaces >= firstItemMarkerWidth || blankLineCount > 0) {
                        // Strip indentation equal to marker width
                        const stripped = line.substring(Math.min(leadingSpaces, firstItemMarkerWidth));
                        currentItemLines.push(stripped);
                        blankLineCount = 0;
                        idx = end;
                    } else {
                        // Line doesn't belong to this list
                        break;
                    }
                } else {
                    // No current item, list is done
                    break;
                }
            }
        }
        // Save last item
        if (currentItemLines.length > 0) {
            if (blankLineCount > 0) {
                loose = true;
            }
            const itemContent = currentItemLines.join('');
            items.push(this.createListItemFromContent(itemContent, initialIndent));
        }


        // Mark all items as loose if list is loose
        if (loose) {
            for (const item of items) {
                (item as any).loose = true;
            }
        }
        const raw = input.slice(0, idx);
        return [{
            type: TokenType.OLIST,
            raw: raw,
            start: start,
            loose: loose,
            tokens: items
        }, idx];
    }

    /**
     * Creates a list item token from content string.
     * @param content The content of the list item (marker already stripped)
     * @param indent The indentation of the list marker
     * @returns A ListItemToken
     */
    private createListItemFromContent(content: string, indent: number): Token {
        const isLoose: boolean = /\n\n/.test(content);
        return {
            type: TokenType.LIST_ITEM,
            raw: content,
            indent: indent,
            loose: isLoose,
            tokens: this.tokenize(content.trim())
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
        let marker: string;
        let indent: number;
        let markerWidth: number;
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
            case TokenType.INDENTED_CODE_BLOCK:
                [result, length] = this.parseIndentedCodeBlock(input, match![2], match![1].length);
                return [{
                    type,
                    raw,
                    text: result,
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
            case TokenType.ULIST:
                marker = match![2];
                indent = match![1].length;
                markerWidth = match![0].length;
                return this.parseUnorderedList(input, marker, indent, markerWidth);

            case TokenType.OLIST:
                marker = match![2];
                indent = match![1].length;
                markerWidth = match![0].length;
                return this.parseOrderedList(input, marker, indent, markerWidth);

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

    private isEmptyLine(line: string): boolean {
        return /^\s*\n?$/.test(line);
    }
}

const lexer = new Lexer();
lexer.tokenize("    abc");
export {Lexer};