import {ASTNode} from './parser';
import {TokenType} from './types';

/**
 * The Renderer class is responsible for converting the Abstract Syntax Tree (AST) into an HTML string.
 * It uses a map of handlers to determine how to render each type of node.
 */
class Renderer {
    /**
     * Map of token types to their corresponding render functions.
     * Each function takes an ASTNode and returns an HTML string.
     */
    private handlers: Map<TokenType, (node: ASTNode) => string> = new Map([
        [TokenType.BODY, (n) => this.renderChildren(n)],
        [TokenType.HEADING, (n: ASTNode) => `<h${n.attributes?.depth}>${this.renderChildren(n)}</h${n.attributes?.depth}>`],
        [TokenType.BOLD, (n) => `<strong>${this.renderChildren(n)}</strong>`],
        [TokenType.ITALIC, (n) => `<em>${this.renderChildren(n)}</em>`],
        [TokenType.BOLD_ITALIC, (n) => `<strong><em>${this.renderChildren(n)}</em></strong>`],
        [TokenType.CODE_BLOCK, (n) => `<pre><code class="lang-${n.attributes?.lang}">${n.value}</code></pre>`],
        [TokenType.CODE_INLINE, (n) => `<code>${n.value}</code>`],
        [TokenType.LINK, (n) => `<a href="${n.attributes?.href}">${this.renderChildren(n)}</a>`],
        [TokenType.IMAGE, (n) => `<img src="${n.attributes?.href}" alt="${n.value}" />`],
        [TokenType.BLOCKQUOTE, (n) => `<blockquote>${this.renderChildren(n)}</blockquote>`],
        [TokenType.LIST, (node) => {
            const tag = node.attributes?.ordered ? 'ol' : 'ul';
            const start = node.attributes?.start;
            const startAttr = start && start !== 1 ? ` start="${start}"` : '';

            return `<${tag}${startAttr}>\n${this.renderChildren(node)}</${tag}>\n`;
        }],

        [TokenType.LIST_ITEM, (node) => {
            if (node.attributes?.loose) {
                return `<li>${this.renderChildren(node)}</li>\n`;
            }
            // Tight list item: unwrap paragraphs
            const children = node.children?.map(c => {
                if (c.type === TokenType.PARAGRAPH) {
                    return this.renderChildren(c);
                }
                return this.renderNode(c);
            }).join('') || node.value || '';
            return `<li>${children}</li>\n`;
        }],
        [TokenType.NEWLINE, () => ``],
        [TokenType.SOFTBREAK, () => ` `],
        [TokenType.HARDBREAK, () => `<br>`],
        [TokenType.HR, () => `<hr />`],
        [TokenType.PARAGRAPHBREAK, () => `<br>`],
        [TokenType.TEXT, (n) => n.value || ''],
        [TokenType.PARAGRAPH, (n) => `<p>${this.renderChildren(n)}</p>` || ''],
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
        return node.children?.map(c => this.renderNode(c)).join('') || node.value || '';
    }
}

export {Renderer};