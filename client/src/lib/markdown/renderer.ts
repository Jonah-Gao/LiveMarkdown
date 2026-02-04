import {ASTNode} from './parser';
import {TokenType} from './types';
import DOMPurify from 'dompurify';

function escapeHtml(str: string): string {
    return str
        // .replace(/&/g, '&amp;')
        // .replace(/</g, '&lt;')
        // .replace(/>/g, '&gt;')
        // .replace(/"/g, '&quot;')
        // .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
    return escapeHtml(str);
}

class Renderer {
    /**
     * Map of token types to their corresponding render functions.
     * Each function takes an ASTNode and returns an HTML string.
     */
    private handlers: Map<TokenType, (node: ASTNode) => string> = new Map<TokenType, (node: ASTNode) => string>([
        [TokenType.BODY, (n) => this.renderChildren(n)],
        [TokenType.HEADING, (n) => {
            const depth = n.attributes?.depth ?? 1;
            return `<h${depth}>${this.renderChildren(n)}</h${depth}>`;
        }],
        [TokenType.BOLD, (n) => `<strong>${this.renderChildren(n)}</strong>`],
        [TokenType.ITALIC, (n) => `<em>${this.renderChildren(n)}</em>`],
        [TokenType.BOLD_ITALIC, (n) => `<strong><em>${this.renderChildren(n)}</em></strong>`],
        [TokenType.CODE_BLOCK, (n) => {
            const lang: string = (n.attributes?.lang || 'plaintext') as string;
            const code = escapeHtml(n.value || '');
            return `<pre><code class="language-${escapeAttr(lang)}">${code}</code></pre>`;
        }],
        [TokenType.INDENTED_CODE_BLOCK, (n) => {
            const code = escapeHtml(n.value || '');
            return `<pre><code>${code}</code></pre>`;
        }],
        [TokenType.CODE_INLINE, (n) => `<code>${escapeHtml(n.value || '')}</code>`],
        [TokenType.LINK, (n) => {
            const href = n.attributes?.href ? ` href="${escapeAttr(n.attributes.href as string)}"` : '';
            const title = n.attributes?.title ? ` title="${escapeAttr(n.attributes.title as string)}"` : '';
            return `<a${href}${title}>${this.renderChildren(n)}</a>`;
        }],
        [TokenType.AUTOLINK, (n) => {
            const href = n.attributes?.href ? escapeAttr(n.attributes.href as string) : '';
            const text = escapeHtml(n.value || href);
            return `<a href="${href}">${text}</a>`;
        }],
        [TokenType.IMAGE, (n) => {
            const src = escapeAttr((n.attributes?.href || '') as string);
            const alt = escapeAttr(n.value || '');
            const title = n.attributes?.title ? ` title="${escapeAttr(n.attributes.title as string)}"` : '';
            return `<img src="${src}" alt="${alt}" loading="lazy"${title}>`;
        }],
        [TokenType.BLOCKQUOTE, (n) => `<blockquote>${this.renderChildren(n)}</blockquote>`],
        [TokenType.ULIST, (node) => `<ul>${this.renderChildren(node)}</ul>`],
        [TokenType.OLIST, (node) => {
            const start = node.attributes?.start;
            const startAttr = start && start !== 1 ? ` start="${start}"` : '';
            return `<ol${startAttr}>${this.renderChildren(node)}</ol>`;
        }],
        [TokenType.LIST_ITEM, (node) => {
            if (node.attributes?.loose) {
                // Loose: contains paragraphs
                return `<li>${this.renderChildren(node)}</li>`;
            }

            // Tight: unwrap paragraphs
            const children: Array<string> = node.children?.flatMap(c => {
                if (c.type === 'paragraph') {
                    return this.renderChildren(c); // unwrap paragraph
                }
                return this.renderNode(c);
            }) || [escapeHtml(node.value || '')];

            return `<li>${children.join('')}</li>`;
        }],
        [TokenType.NEWLINE, () => ``],
        [TokenType.SOFTBREAK, () => `\n`],
        [TokenType.HARDBREAK, () => `<br>`],
        [TokenType.HR, () => `<hr>`],
        [TokenType.ESCAPE, (n) => escapeHtml(n.value || '')],
        [TokenType.TEXT, (n) => escapeHtml(n.value || '')],
        [TokenType.PARAGRAPH, (n) => `<p>${this.renderChildren(n)}</p>`],
        [TokenType.HTML, (n) => {
            // DOMPurify filtering
            return DOMPurify.sanitize(n.value || '');
        }],
    ]);

    /**
     * Renders the AST into an HTML string.
     * @param ast The root node of the AST.
     * @returns The generated HTML string.
     */
    render(ast: ASTNode): string {
        return this.renderNode(ast);
    }

    /**
     * Renders a single node by looking up its handler.
     * If no handler is found, it falls back to rendering the node's children.
     * @param node The node to render.
     * @returns The HTML string for the node.
     */
    private renderNode(node: ASTNode): string {
        const handler = this.handlers.get(node.type);
        return handler ? handler(node) : this.renderChildren(node);
    }

    /**
     * Renders the children of a node and joins them into a single string.
     * If the node has no children, it returns the node's value (text content).
     * @param node The parent node.
     * @returns The concatenated HTML string of the children.
     */
    private renderChildren(node: ASTNode): string {
        if (!node.children || node.children.length === 0) {
            return escapeHtml(node.value || '');
        }
        return node.children.map(c => this.renderNode(c)).join('');
    }
}

export {Renderer};