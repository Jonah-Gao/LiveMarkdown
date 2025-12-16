import {ASTNode} from './parser';
import {TokenType} from './types';

class Renderer {
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
            return `<li>${this.renderChildren(node)}</li>\n`;
        }],
        [TokenType.NEWLINE, () => ``],
        [TokenType.SOFTBREAK, () => ` `],
        [TokenType.HARDBREAK, () => `<br>`],
        [TokenType.HR, () => `<hr />`],
        [TokenType.PARAGRAPHBREAK, () => `<br>`],
        [TokenType.TEXT, (n) => n.value || ''],
        [TokenType.PARAGRAPH, (n) => `<p>${this.renderChildren(n)}</p>` || ''],
    ]);

    render(ast: ASTNode): string {
        return this.renderNode(ast);
    }

    private renderNode(node: ASTNode): string {
        const handler = this.handlers.get(node.type);
        return handler ? handler(node) : this.renderChildren(node);
    }

    private renderChildren(node: ASTNode): string {
        return node.children?.map(c => this.renderNode(c)).join('') || node.value || '';
    }
}

export {Renderer};