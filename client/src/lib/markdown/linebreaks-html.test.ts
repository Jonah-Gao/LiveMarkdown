import {describe, expect, it} from 'vitest';
import {Lexer} from './lexer';
import {TokenType} from './types';

describe('Line breaks', () => {
    const lexer = new Lexer();

    it('parses hard line breaks from spaces and backslash', () => {
        const tokens = lexer.tokenize('foo  \nbar');
        const inline = tokens[0].tokens || [];
        expect(inline.map(t => t.type)).toEqual([TokenType.TEXT, TokenType.HARDBREAK, TokenType.TEXT]);

        const backslash = lexer.tokenize('foo\\\nbar')[0].tokens || [];
        expect(backslash.some(t => t.type === TokenType.HARDBREAK)).toBe(true);
    });

    it('parses soft line breaks', () => {
        const inline = lexer.tokenize('foo\nbar')[0].tokens || [];
        expect(inline.some(t => t.type === TokenType.SOFTBREAK)).toBe(true);
        expect(inline.some(t => t.type === TokenType.HARDBREAK)).toBe(false);
    });
});

describe('HTML blocks and inline HTML', () => {
    const lexer = new Lexer();

    it('tokenizes html blocks and sanitizes them', () => {
        const tokens = lexer.tokenize('<script>alert(1)</script>\n<div onclick="evil()">ok</div>');
        expect(tokens[0].type).toBe(TokenType.HTML);
        expect(tokens[0].text).toContain('<div>ok</div>');
        expect(tokens[0].text).not.toContain('script');
        expect(tokens[0].text).not.toContain('onclick');
    });

    it('tokenizes inline html and strips unsafe attributes', () => {
        const inlineTokens = lexer.tokenize('Hello <span onclick="evil()">world</span>')[0].tokens || [];
        const htmlToken = inlineTokens.find(t => t.type === TokenType.HTML);
        expect(htmlToken).toBeDefined();
        expect(htmlToken?.text).toBe('<span>world</span>');
    });
});
