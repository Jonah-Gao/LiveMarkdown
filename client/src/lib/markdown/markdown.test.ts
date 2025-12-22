import { describe, it, expect } from 'vitest';
import { MarkdownParser } from './markdown';

describe('MarkdownParser', () => {
    const parser = new MarkdownParser();

    it('should parse headings', () => {
        expect(parser.render('# Heading 1')).toContain('<h1>Heading 1</h1>');
        expect(parser.render('## Heading 2')).toContain('<h2>Heading 2</h2>');
        expect(parser.render('### Heading 3')).toContain('<h3>Heading 3</h3>');
        expect(parser.render('#### Heading 4')).toContain('<h4>Heading 4</h4>');
        expect(parser.render('##### Heading 5')).toContain('<h5>Heading 5</h5>');
        expect(parser.render('###### Heading 6')).toContain('<h6>Heading 6</h6>');
    });

    it('should parse bold text', () => {
        expect(parser.render('**bold**')).toContain('<strong>bold</strong>');
    });

    it('should parse italic text', () => {
        expect(parser.render('*italic*')).toContain('<em>italic</em>');
    });

    it('should parse inline code', () => {
        expect(parser.render('`code`')).toContain('<code>code</code>');
    });

    it('should parse code blocks', () => {
        const markdown = '```typescript\nconst a = 1;\n```';
        const html = parser.render(markdown);
        expect(html).toContain('<pre><code class="lang-typescript">const a = 1;</code></pre>');
    });

    it('should parse links', () => {
        expect(parser.render('[link](https://example.com)')).toContain('<a href="https://example.com">link</a>');
    });

    it('should parse images', () => {
        expect(parser.render('![alt](https://example.com/image.png)')).toContain('<img src="https://example.com/image.png" alt="alt" />');
    });

    it('should parse blockquotes', () => {
        expect(parser.render('> quote')).toContain('<blockquote>quote</blockquote>');
    });

    it('should parse horizontal rules', () => {
        expect(parser.render('---')).toContain('<hr />');
        expect(parser.render('***')).toContain('<hr />');
        expect(parser.render('___')).toContain('<hr />');
    });

    it('should handle nested formatting', () => {
        expect(parser.render('**bold and *italic***')).toContain('<strong>bold and <em>italic</em></strong>');
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
        expect(parser.render('Just some text')).toBe('<p>Just some text</p>');
    });

    it('should parse ordered lists', () => {
        const markdown = '1. First\n2. Second';
        const html = parser.render(markdown);
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>First</li>');
        expect(html).toContain('<li>Second</li>');
        expect(html).toContain('</ol>');
    });

    it('should parse ordered lists with start number', () => {
        const markdown = '3. Third\n4. Fourth';
        const html = parser.render(markdown);
        expect(html).toContain('<ol start="3">');
        expect(html).toContain('<li>Third</li>');
        expect(html).toContain('<li>Fourth</li>');
        expect(html).toContain('</ol>');
    });

    it('should handle mixed lists', () => {
        const markdown = '* Item 1\n1. Item 2';
        const html = parser.render(markdown);
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>Item 1</li>');
        expect(html).toContain('</ul>');
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>Item 2</li>');
        expect(html).toContain('</ol>');
    });

    it('should handle mixed bullets in unordered list', () => {
        const markdown = '+ 12312\n* ';
        const html = parser.render(markdown);
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>12312</li>');
        expect(html).toContain('<li></li>');
        expect(html).toContain('</ul>');
    });
});
