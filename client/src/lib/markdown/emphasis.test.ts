import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Preprocessor } from './preprocessor';
import { TokenType } from './types';

describe('Emphasis Parsing', () => {
    const lexer = new Lexer();

    describe('Basic emphasis', () => {
        it('should parse *emphasis* correctly', () => {
            const tokens = lexer.tokenize('*hello*');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            expect(inlineTokens[0].type).toBe(TokenType.ITALIC);
            expect(inlineTokens[0].text).toBe('hello');
        });

        it('should parse _emphasis_ correctly', () => {
            const tokens = lexer.tokenize('_hello_');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            expect(inlineTokens[0].type).toBe(TokenType.ITALIC);
            expect(inlineTokens[0].text).toBe('hello');
        });

        it('should parse **strong** correctly', () => {
            const tokens = lexer.tokenize('**hello**');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            expect(inlineTokens[0].type).toBe(TokenType.BOLD);
            expect(inlineTokens[0].text).toBe('hello');
        });

        it('should parse __strong__ correctly', () => {
            const tokens = lexer.tokenize('__hello__');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            expect(inlineTokens[0].type).toBe(TokenType.BOLD);
            expect(inlineTokens[0].text).toBe('hello');
        });
    });

    describe('Intraword emphasis', () => {
        it('should allow intraword emphasis with *', () => {
            const tokens = lexer.tokenize('foo*bar*baz');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            // Should have: "foo", italic("bar"), "baz"
            expect(inlineTokens.some(t => t.type === TokenType.ITALIC && t.text === 'bar')).toBe(true);
        });

        it('should NOT allow intraword emphasis with _', () => {
            const tokens = lexer.tokenize('foo_bar_baz');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe(TokenType.PARAGRAPH);
            const inlineTokens = tokens[0].tokens || [];
            // Should be all text, no emphasis
            expect(inlineTokens.every(t => t.type === TokenType.TEXT)).toBe(true);
        });
    });
});

describe('Preprocessor', () => {
    const preprocessor = new Preprocessor();
    const lexer = new Lexer();

    describe('Empty lines at start/end', () => {
        it('should ignore leading empty lines', () => {
            const processed = preprocessor.preprocess('\n\nhello');
            expect(processed).toBe('hello');
        });

        it('should ignore trailing empty lines', () => {
            const processed = preprocessor.preprocess('hello\n\n');
            expect(processed).toBe('hello');
        });

        it('should ignore both leading and trailing empty lines', () => {
            const processed = preprocessor.preprocess('\n\nhello\n\n');
            expect(processed).toBe('hello');
        });
    });
});

describe('Setext Headings', () => {
    const lexer = new Lexer();

    it('should parse setext heading level 1', () => {
        const tokens = lexer.tokenize('Hello\n===');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect(tokens[0].text).toBe('Hello');
        expect((tokens[0] as any).depth).toBe(1);
    });

    it('should parse setext heading level 2', () => {
        const tokens = lexer.tokenize('Hello\n---');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect(tokens[0].text).toBe('Hello');
        expect((tokens[0] as any).depth).toBe(2);
    });

    it('should parse setext heading with multiple = signs', () => {
        const tokens = lexer.tokenize('Hello\n=======');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect((tokens[0] as any).depth).toBe(1);
    });

    it('should parse setext heading with multiple - signs', () => {
        const tokens = lexer.tokenize('Hello\n-------');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.HEADING);
        expect((tokens[0] as any).depth).toBe(2);
    });
});
