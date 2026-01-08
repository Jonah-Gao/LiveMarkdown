import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { TokenType } from './types';

describe('Nested Emphasis Fixes', () => {
    const lexer = new Lexer();

    it('should parse *(*foo*)* correctly without duplicates', () => {
        const tokens = lexer.tokenize('*(*foo*)*');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
        
        const inlineTokens = tokens[0].tokens || [];
        // Should have exactly 1 top-level italic token (not duplicates)
        expect(inlineTokens.length).toBe(1);
        expect(inlineTokens[0].type).toBe(TokenType.ITALIC);
        expect(inlineTokens[0].text).toBe('(*foo*)');
        
        // The inner tokens should have: "(", italic "foo", ")"
        const innerTokens = inlineTokens[0].tokens || [];
        expect(innerTokens.length).toBe(3);
        expect(innerTokens[0].type).toBe(TokenType.TEXT);
        expect(innerTokens[0].text).toBe('(');
        expect(innerTokens[1].type).toBe(TokenType.ITALIC);
        expect(innerTokens[1].text).toBe('foo');
        expect(innerTokens[2].type).toBe(TokenType.TEXT);
        expect(innerTokens[2].text).toBe(')');
    });

    it('should parse **foo *bar* baz** correctly without duplicates', () => {
        const tokens = lexer.tokenize('**foo *bar* baz**');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
        
        const inlineTokens = tokens[0].tokens || [];
        // Should have exactly 1 bold token (not duplicates)
        expect(inlineTokens.length).toBe(1);
        expect(inlineTokens[0].type).toBe(TokenType.BOLD);
        expect(inlineTokens[0].text).toBe('foo *bar* baz');
        
        // The inner tokens should have: "foo ", italic "bar", " baz"
        const innerTokens = inlineTokens[0].tokens || [];
        expect(innerTokens.length).toBe(3);
        expect(innerTokens[0].type).toBe(TokenType.TEXT);
        expect(innerTokens[0].text).toBe('foo ');
        expect(innerTokens[1].type).toBe(TokenType.ITALIC);
        expect(innerTokens[1].text).toBe('bar');
        expect(innerTokens[2].type).toBe(TokenType.TEXT);
        expect(innerTokens[2].text).toBe(' baz');
    });

    it('should parse *foo *bar* baz* correctly without duplicates', () => {
        const tokens = lexer.tokenize('*foo *bar* baz*');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
        
        const inlineTokens = tokens[0].tokens || [];
        // Should have exactly 1 italic token (not duplicates)
        expect(inlineTokens.length).toBe(1);
        expect(inlineTokens[0].type).toBe(TokenType.ITALIC);
        expect(inlineTokens[0].text).toBe('foo *bar* baz');
        
        // The inner tokens should have: "foo ", italic "bar", " baz"
        const innerTokens = inlineTokens[0].tokens || [];
        expect(innerTokens.length).toBe(3);
        expect(innerTokens[0].type).toBe(TokenType.TEXT);
        expect(innerTokens[0].text).toBe('foo ');
        expect(innerTokens[1].type).toBe(TokenType.ITALIC);
        expect(innerTokens[1].text).toBe('bar');
        expect(innerTokens[2].type).toBe(TokenType.TEXT);
        expect(innerTokens[2].text).toBe(' baz');
    });

    it('should parse *foo**bar*** correctly', () => {
        const tokens = lexer.tokenize('*foo**bar***');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
        
        const inlineTokens = tokens[0].tokens || [];
        // Expected: *foo<strong>bar</strong>**
        // Should have: text "*foo", bold "bar", text "*", text "*"
        expect(inlineTokens.length).toBe(4);
        expect(inlineTokens[0].type).toBe(TokenType.TEXT);
        expect(inlineTokens[0].text).toBe('*foo');
        expect(inlineTokens[1].type).toBe(TokenType.BOLD);
        expect(inlineTokens[1].text).toBe('bar');
        expect(inlineTokens[2].type).toBe(TokenType.TEXT);
        expect(inlineTokens[2].text).toBe('*');
        expect(inlineTokens[3].type).toBe(TokenType.TEXT);
        expect(inlineTokens[3].text).toBe('*');
    });

    it('should parse **foo*bar*** correctly', () => {
        const tokens = lexer.tokenize('**foo*bar***');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
        
        const inlineTokens = tokens[0].tokens || [];
        // Expected: **foo<em>bar</em>***
        // Should have: text "**foo", italic "bar", text "**", text "**"
        expect(inlineTokens.length).toBe(4);
        expect(inlineTokens[0].type).toBe(TokenType.TEXT);
        expect(inlineTokens[0].text).toBe('**foo');
        expect(inlineTokens[1].type).toBe(TokenType.ITALIC);
        expect(inlineTokens[1].text).toBe('bar');
        expect(inlineTokens[2].type).toBe(TokenType.TEXT);
        expect(inlineTokens[2].text).toBe('**');
        expect(inlineTokens[3].type).toBe(TokenType.TEXT);
        expect(inlineTokens[3].text).toBe('**');
    });
});

describe('Setext Heading Multi-line Support', () => {
    const lexer = new Lexer();

    it('should parse foo\\nbar\\n=== as single level 1 heading', () => {
        const tokens = lexer.tokenize('foo\nbar\n===');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect((tokens[0] as any).depth).toBe(1);
        expect(tokens[0].text).toBe('foo\nbar');
        
        // Should contain: text "foo", softbreak, text "bar"
        const inlineTokens = tokens[0].tokens || [];
        expect(inlineTokens.length).toBe(3);
        expect(inlineTokens[0].type).toBe(TokenType.TEXT);
        expect(inlineTokens[0].text).toBe('foo');
        expect(inlineTokens[1].type).toBe(TokenType.SOFTBREAK);
        expect(inlineTokens[2].type).toBe(TokenType.TEXT);
        expect(inlineTokens[2].text).toBe('bar');
    });

    it('should parse foo  \\nbar\\n=== with hardbreak', () => {
        const tokens = lexer.tokenize('foo  \nbar\n===');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect((tokens[0] as any).depth).toBe(1);
        expect(tokens[0].text).toBe('foo  \nbar');
        
        // Should contain: text "foo", hardbreak, text "bar"
        const inlineTokens = tokens[0].tokens || [];
        expect(inlineTokens.length).toBe(3);
        expect(inlineTokens[0].type).toBe(TokenType.TEXT);
        expect(inlineTokens[0].text).toBe('foo');
        expect(inlineTokens[1].type).toBe(TokenType.HARDBREAK);
        expect(inlineTokens[2].type).toBe(TokenType.TEXT);
        expect(inlineTokens[2].text).toBe('bar');
    });

    it('should parse foo\\nbar\\n--- as single level 2 heading', () => {
        const tokens = lexer.tokenize('foo\nbar\n---');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect((tokens[0] as any).depth).toBe(2);
        expect(tokens[0].text).toBe('foo\nbar');
    });
});
