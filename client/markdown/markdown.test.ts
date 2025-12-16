import { describe, it, expect } from 'vitest';
import { MarkdownParser } from './markdown';

describe('MarkdownParser', () => {
    const parser = new MarkdownParser();

    it('should parse headings', () => {
        expect(parser.parse('# Heading 1')).toContain('<h1>Heading 1</h1>');
        expect(parser.parse('## Heading 2')).toContain('<h2>Heading 2</h2>');
        expect(parser.parse('### Heading 3')).toContain('<h3>Heading 3</h3>');
        expect(parser.parse('#### Heading 4')).toContain('<h4>Heading 4</h4>');
        expect(parser.parse('##### Heading 5')).toContain('<h5>Heading 5</h5>');
        expect(parser.parse('###### Heading 6')).toContain('<h6>Heading 6</h6>');
    });

    it('should parse bold text', () => {
        expect(parser.parse('**bold**')).toContain('<strong>bold</strong>');
    });

    it('should parse italic text', () => {
        expect(parser.parse('*italic*')).toContain('<em>italic</em>');
    });

    it('should parse inline code', () => {
        expect(parser.parse('`code`')).toContain('<code>code</code>');
    });

    it('should parse code blocks', () => {
        const markdown = '```typescript\nconst a = 1;\n```';
        const html = parser.parse(markdown);
        expect(html).toContain('<pre><code class="lang-typescript">const a = 1;</code></pre>');
    });

    it('should parse links', () => {
        expect(parser.parse('[link](https://example.com)')).toContain('<a href="https://example.com">link</a>');
    });

    it('should parse images', () => {
        expect(parser.parse('![alt](https://example.com/image.png)')).toContain('<img src="https://example.com/image.png" alt="alt" />');
    });

    it('should parse blockquotes', () => {
        expect(parser.parse('> quote')).toContain('<blockquote>quote</blockquote>');
    });

    it('should parse horizontal rules', () => {
        expect(parser.parse('---')).toContain('<hr />');
        expect(parser.parse('***')).toContain('<hr />');
        expect(parser.parse('___')).toContain('<hr />');
    });

    it('should handle nested formatting', () => {
        expect(parser.parse('**bold and *italic***')).toContain('<strong>bold and <em>italic</em></strong>');
    });

    it('should handle paragraphs (plain text)', () => {
        // The parser wraps everything in a root node, but doesn't seem to explicitly wrap text in <p> tags
        // unless there is logic for it.
        // Looking at parser.ts: root is TokenType.PARAGRAPH.
        // Looking at renderer.ts: TokenType.PARAGRAPH is not in handlers map?
        // Wait, let's check renderer.ts again.
        // It has handlers for HEADING, BOLD, etc.
        // It does NOT have a handler for PARAGRAPH.
        // So it falls back to renderChildren.
        // So plain text is just returned as text.
        expect(parser.parse('Just some text')).toBe('<p>Just some text</p>');
    });
});

