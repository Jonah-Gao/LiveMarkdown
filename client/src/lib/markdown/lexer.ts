import {Token, TokenType} from './types.ts';

/**
 * Delimiter for emphasis parsing
 */
interface Delimiter {
    type: '*' | '_';
    count: number;
    pos: number;
    canOpen: boolean;
    canClose: boolean;
    active: boolean;
}

/**
 * Match between opener and closer delimiters
 */
interface DelimiterMatch {
    openerIdx: number;
    closerIdx: number;
    count: number;
}

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
    ];

    /**
     * Rules for inline elements (bold, italic, links, etc.).
     * Order matters: more specific patterns should come first.
     * Note: Emphasis (* and _) is now handled separately via delimiter-based parsing
     */
    private inlineRules: Array<[TokenType, RegExp]> = [
        // Escape sequences (must be first to handle escaped characters)
        [TokenType.ESCAPE, /\\([\\`*_{}\[\]()#+\-.!|~])/],
        [TokenType.HARDBREAK, / {2,}\n/],
        [TokenType.SOFTBREAK, /\n/],
        // Code (highest priority to avoid conflicts)
        [TokenType.CODE_INLINE, /`([^`\n]+)`/],
        // Images (must come before links due to leading !)
        [TokenType.IMAGE, /!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)/],
        [TokenType.LINK, /\[([^\]]+)]\(([^)\s]+)(?:\s+"([^"]+)")?\)/],
        [TokenType.AUTOLINK, /<(https?:\/\/[a-zA-Z0-9][\w.-]*(?::[0-9]+)?(?:\/[^\s>]*)?)>/],
        [TokenType.AUTOLINK, /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/],
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
            // Skip empty lines between block elements (CommonMark compliance)
            const emptyLineMatch = input.match(/^(\n+)/);
            if (emptyLineMatch && tokens.length > 0) {
                input = input.slice(emptyLineMatch[0].length);
                continue;
            }

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

            // Check for setext heading underline after any lines
            if (lines.length >= 1 && !this.isEmptyLine(line)) {
                const setextMatch = line.match(/^ {0,3}(=+|-+)\s*$/);
                if (setextMatch) {
                    // This is a setext heading - don't include the underline
                    // Return the heading info instead of paragraph
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
     * Check if a character is Unicode whitespace
     */
    private isUnicodeWhitespace(char: string | undefined): boolean {
        if (!char) return true; // Beginning/end of line counts as whitespace
        return /\s/.test(char);
    }

    /**
     * Check if a character is Unicode punctuation
     * This includes ASCII punctuation and Unicode punctuation categories
     */
    private isUnicodePunctuation(char: string | undefined): boolean {
        if (!char) return false;
        // ASCII punctuation
        if (/[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/.test(char)) return true;
        // Unicode punctuation categories: Pc, Pd, Pe, Pf, Pi, Po, Ps
        return /\p{P}/u.test(char);
    }

    /**
     * Check if a delimiter run is left-flanking
     */
    private isLeftFlanking(text: string, startIdx: number, length: number, _delimChar: string): boolean {
        const after = text[startIdx + length];
        const before = text[startIdx - 1];

        // (1) not followed by Unicode whitespace
        if (this.isUnicodeWhitespace(after)) return false;

        // (2a) not followed by a Unicode punctuation character
        if (!this.isUnicodePunctuation(after)) return true;

        // (2b) followed by a Unicode punctuation character and 
        // preceded by Unicode whitespace or a Unicode punctuation character
        return this.isUnicodeWhitespace(before) || this.isUnicodePunctuation(before);
    }

    /**
     * Check if a delimiter run is right-flanking
     */
    private isRightFlanking(text: string, startIdx: number, length: number, _delimChar: string): boolean {
        const before = text[startIdx - 1];
        const after = text[startIdx + length];

        // (1) not preceded by Unicode whitespace
        if (this.isUnicodeWhitespace(before)) return false;

        // (2a) not preceded by a Unicode punctuation character
        if (!this.isUnicodePunctuation(before)) return true;

        // (2b) preceded by a Unicode punctuation character and
        // followed by Unicode whitespace or a Unicode punctuation character
        return this.isUnicodeWhitespace(after) || this.isUnicodePunctuation(after);
    }

    /**
     * Parse emphasis and strong emphasis using delimiter-based parsing
     * according to CommonMark specification
     */
    private parseEmphasis(text: string): Token[] {
        if (!text) return [];

        // First pass: identify all potential delimiter runs
        const delimiters: Delimiter[] = [];
        let i = 0;

        while (i < text.length) {
            const char = text[i];
            if (char === '*' || char === '_') {
                const startPos = i;
                let count = 0;

                while (i < text.length && text[i] === char) {
                    count++;
                    i++;
                }

                const leftFlanking = this.isLeftFlanking(text, startPos, count, char);
                const rightFlanking = this.isRightFlanking(text, startPos, count, char);

                let canOpen = false;
                let canClose = false;

                if (char === '*') {
                    canOpen = leftFlanking;
                    canClose = rightFlanking;
                } else { // '_'
                    canOpen = leftFlanking && (!rightFlanking || this.isUnicodePunctuation(text[startPos - 1]));
                    canClose = rightFlanking && (!leftFlanking || this.isUnicodePunctuation(text[startPos + count]));
                }

                delimiters.push({
                    type: char,
                    count: count,
                    pos: startPos,
                    canOpen: canOpen,
                    canClose: canClose,
                    active: true
                });
            } else {
                i++;
            }
        }

        // Second pass: match openers with closers
        const matches: DelimiterMatch[] = [];

        for (let closerIdx = 0; closerIdx < delimiters.length; closerIdx++) {
            const closer = delimiters[closerIdx];
            if (!closer.canClose || !closer.active) continue;

            // Look backwards for a matching opener
            for (let openerIdx = closerIdx - 1; openerIdx >= 0; openerIdx--) {
                const opener = delimiters[openerIdx];
                if (!opener.canOpen || !opener.active || opener.type !== closer.type) continue;

                // Check the "multiple of 3" rule
                const canOpenAndClose = opener.canOpen && opener.canClose;
                const closerCanOpenAndClose = closer.canOpen && closer.canClose;

                if (canOpenAndClose || closerCanOpenAndClose) {
                    const totalLength = opener.count + closer.count;
                    if (totalLength % 3 === 0 && opener.count % 3 !== 0 && closer.count % 3 !== 0) {
                        continue;
                    }
                }

                // Prefer strong emphasis (use 2) over regular (use 1)
                let useCount: number;
                if (opener.count >= 2 && closer.count >= 2) {
                    useCount = 2;
                } else {
                    useCount = 1;
                }

                matches.push({ openerIdx, closerIdx, count: useCount });

                opener.count -= useCount;
                closer.count -= useCount;

                if (opener.count === 0) opener.active = false;
                if (closer.count === 0) closer.active = false;

                break;
            }
        }

        // Third pass: build tokens from text and matches
        if (matches.length === 0) {
            // No emphasis found, return as plain text
            return text ? [{
                type: TokenType.TEXT,
                raw: text,
                text: text
            }] : [];
        }

        // Sort matches by position for building tokens
        matches.sort((a, b) => {
            const aStart = delimiters[a.openerIdx].pos;
            const bStart = delimiters[b.openerIdx].pos;
            return aStart - bStart;
        });

        const result: Token[] = [];
        let currentPos = 0;

        for (const match of matches) {
            const opener = delimiters[match.openerIdx];
            const closer = delimiters[match.closerIdx];
            
            // Calculate actual positions
            const openerStart = opener.pos;
            const openerEnd = opener.pos + match.count;  // Position after matched delimiters
            const closerStart = closer.pos;
            const closerEnd = closer.pos + match.count;  // Position after matched delimiters

            // Skip if this match is entirely within a range we've already processed
            if (currentPos > openerStart) {
                continue;
            }

            // Add text before this emphasis
            if (currentPos < openerStart) {
                const beforeText = text.substring(currentPos, openerStart);
                result.push(...this.parseEmphasis(beforeText));
            }

            // Add unmatched opener delimiters as text
            if (opener.count > 0) {
                result.push({
                    type: TokenType.TEXT,
                    raw: opener.type.repeat(opener.count),
                    text: opener.type.repeat(opener.count)
                });
            }

            // Extract content between opener and closer
            const content = text.substring(openerEnd, closerStart);
            const emphType = match.count === 2 ? TokenType.BOLD : TokenType.ITALIC;

            // Recursively parse the content for nested emphasis
            const innerTokens = content ? this.parseEmphasis(content) : [];

            result.push({
                type: emphType,
                raw: opener.type.repeat(match.count) + content + closer.type.repeat(match.count),
                text: content,
                tokens: innerTokens
            });

            // Add unmatched closer delimiters as text
            if (closer.count > 0) {
                result.push({
                    type: TokenType.TEXT,
                    raw: closer.type.repeat(closer.count),
                    text: closer.type.repeat(closer.count)
                });
            }

            currentPos = closerEnd;
        }

        // Add remaining text after all matches
        if (currentPos < text.length) {
            const remainingText = text.substring(currentPos);
            result.push(...this.parseEmphasis(remainingText));
        }

        return result;
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

            // Try to match non-emphasis inline rules first
            for (const [type, regex] of this.inlineRules) {
                const match: RegExpMatchArray | null = remaining.match(regex);
                if (match && match.index === 0) {
                    // Flush plain text buffer before adding new token
                    if (plainTextBuffer.length > 0) {
                        // Parse emphasis in the accumulated text
                        const emphasisTokens = this.parseEmphasis(plainTextBuffer.join(''));
                        tokens.push(...emphasisTokens);
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
        
        // Flush any remaining plain text with emphasis parsing
        if (plainTextBuffer.length > 0) {
            const emphasisTokens = this.parseEmphasis(plainTextBuffer.join(''));
            tokens.push(...emphasisTokens);
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
            // Escape the special characters for regex
            const escapedMarker = initialMarker.replace(/[*-]/g, '\\$&');
            const HR = new RegExp(`^ *(${escapedMarker} *){2,}(?:\\n|$)`)
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
            case TokenType.BOLD_ITALIC:
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
                    title: match![3],
                    tokens: this.parseInline(match![1]),
                }, 0];
            case TokenType.AUTOLINK:
                return [{
                    type,
                    raw,
                    text: match![1],
                    href: match![1],
                }, 0];
            case TokenType.IMAGE:
                return [{
                    type,
                    raw,
                    text: match![1],
                    href: match![2],
                    title: match![3],
                    alt: match![1],
                }, 0];
            case TokenType.PARAGRAPH:
                [result, length] = this.parseParagraph(input);
                
                // Check if the next line is a setext heading underline
                if (typeof result === 'string') {
                    const nextLineStart = length;
                    const nextLineEnd = input.indexOf('\n', nextLineStart);
                    const nextLineEndWithNewline = nextLineEnd === -1 ? input.length : nextLineEnd + 1;
                    const nextLine = input.slice(nextLineStart, nextLineEndWithNewline);
                    
                    const setextMatch = nextLine.match(/^ {0,3}(=+|-+)\s*$/);
                    if (setextMatch) {
                        // This is a setext heading
                        const depth = setextMatch[1][0] === '=' ? 1 : 2;
                        return [{
                            type: TokenType.HEADING,
                            raw: raw,
                            text: result,
                            depth: depth as 1 | 2,
                            tokens: this.parseInline(result),
                        }, length + nextLineEndWithNewline - nextLineStart];
                    }
                }
                
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
            case TokenType.ESCAPE:
                return [{
                    type,
                    raw,
                    text: match![1],
                }, 0];

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