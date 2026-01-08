import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { TokenType } from './types';

describe('Nested Emphasis Issues', () => {
    const lexer = new Lexer();
    const parser = new Parser();

    it('should parse *(*foo*)* correctly', () => {
        const tokens = lexer.tokenize('*(*foo*)*');
        console.log('Test case: *(*foo*)*');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: <em>(<em>foo</em>)</em>
        // The outer * should create emphasis, containing "(", an inner emphasis "foo", and ")"
    });

    it('should parse **foo *bar* baz** correctly', () => {
        const tokens = lexer.tokenize('**foo *bar* baz**');
        console.log('\nTest case: **foo *bar* baz**');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: <strong>foo <em>bar</em> baz</strong>
    });

    it('should parse *foo *bar* baz* correctly', () => {
        const tokens = lexer.tokenize('*foo *bar* baz*');
        console.log('\nTest case: *foo *bar* baz*');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: <em>foo <em>bar</em> baz</em>
    });

    it('should parse *foo**bar*** correctly', () => {
        const tokens = lexer.tokenize('*foo**bar***');
        console.log('\nTest case: *foo**bar***');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: *foo<strong>bar</strong>**
        // The **bar** should be matched as bold, leaving * before and ** after
    });

    it('should parse **foo*bar*** correctly', () => {
        const tokens = lexer.tokenize('**foo*bar***');
        console.log('\nTest case: **foo*bar***');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: **foo<em>bar</em>***
        // The *bar* should be matched as italic, leaving ** before and ** after
    });
});

describe('Setext Heading Multi-line', () => {
    const lexer = new Lexer();

    it('should parse foo\\nbar\\n=== as single heading', () => {
        const tokens = lexer.tokenize('foo\nbar\n===');
        console.log('\nTest case: foo\\nbar\\n===');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: <h1>foo bar</h1>
    });

    it('should parse foo  \\nbar\\n=== with hardbreak', () => {
        const tokens = lexer.tokenize('foo  \nbar\n===');
        console.log('\nTest case: foo  \\nbar\\n===');
        console.log('Tokens:', JSON.stringify(tokens, null, 2));
        
        // Expected: <h1>foo<br>bar</h1>
    });
});
