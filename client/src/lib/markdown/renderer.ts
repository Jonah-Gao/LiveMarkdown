import {ASTNode} from './parser';
import {TokenType} from './types';
import {sanitizeHtml} from './sanitize.ts';
import {Component, h, VNode, Fragment} from 'vue'
import MarkdownCodeBlock from "@/components/MarkdownCodeBlock.vue";
import MarkdownIndentedCodeBlock from "@/components/MarkdownIndentedCodeBlock.vue";


/**
 * The Renderer class is responsible for converting the Abstract Syntax Tree (AST) into an HTML string.
 * It uses a map of handlers to determine how to render each type of node.
 */
class Renderer {
    /**
     * Map of token types to their corresponding render functions.
     * Each function takes an ASTNode and returns an HTML string.
     */
    private handlers: Map<TokenType, (node: ASTNode) => VNode> = new Map<TokenType, (node: ASTNode) => VNode>([
        [TokenType.BODY, (n) => this.renderChildren(n)],
        [TokenType.HEADING, (n) => h(`h${n.attributes?.depth}`, this.renderChildren(n))],
        [TokenType.BOLD, (n) => h('strong', this.renderChildren(n))],
        [TokenType.ITALIC, (n) => h('em', this.renderChildren(n))],
        [TokenType.BOLD_ITALIC, (n) => h('strong', h('em', this.renderChildren(n)))],
        [TokenType.CODE_BLOCK, (n) => h(MarkdownCodeBlock as Component, {
            code: n.value || '', lang: n.attributes?.lang || 'text'
        })],
        [TokenType.INDENTED_CODE_BLOCK, (n) => h(MarkdownIndentedCodeBlock as Component, {
            code: n.value || ''
        })],
        [TokenType.CODE_INLINE, (n) => h('code', n.value)],
        [TokenType.LINK, (n) => {
            const props: Record<string, any> = { href: n.attributes?.href };
            if (n.attributes?.title) props.title = n.attributes.title;
            return h('a', props, this.renderChildren(n));
        }],
        [TokenType.AUTOLINK, (n) => h('a', {href: n.attributes?.href}, n.value || '')],
        [TokenType.IMAGE, (n) => {
            const props: Record<string, any> = {
                src: n.attributes?.href || '',
                alt: n.value || '',
                loading: 'lazy'
            };
            if (n.attributes?.title) props.title = n.attributes.title;
            return h('img', props);
        }],
        [TokenType.BLOCKQUOTE, (n) => h('blockquote', this.renderChildren(n))],
        [TokenType.ULIST, (node) => {
            return h('ul', this.renderChildren(node));
        }],
        [TokenType.OLIST, (node) => {
            const props: Record<string, any> = {};
            const start = node.attributes?.start;
            if (start && start !== 1) props.start = start;

            return h('ol', props, this.renderChildren(node));
        }],

        [TokenType.LIST_ITEM, (node) => {
            if (node.attributes?.loose) {
                // Loose: contains paragraphs
                return h('li', this.renderChildren(node))
            }

            // Tight: unwrap paragraphs
            const children: Array<VNode | string> = node.children?.flatMap(c => {
                if (c.type === 'paragraph') {
                    return this.renderChildren(c)  // unwrap paragraph
                }
                return [this.renderNode(c)]
            }) || [node.value || '']

            return h('li', children)
        }],
        [TokenType.NEWLINE, () => h(Fragment, [''])],
        [TokenType.SOFTBREAK, () => h(Fragment, [' '])],
        [TokenType.HARDBREAK, () => h('br')],
        [TokenType.HR, () => h('hr')],
        [TokenType.PARAGRAPHBREAK, () => h('br')],
        [TokenType.ESCAPE, (n) => h(Fragment, [n.value || ''])],
        [TokenType.TEXT, (n) => h(Fragment, [n.value || ''])],
        [TokenType.PARAGRAPH, (n) => h('p', this.renderChildren(n)) || ''],
        [TokenType.HTML, (n) => {
            const tag = n.attributes?.block ? 'div' : 'span';
            return h(tag, { innerHTML: sanitizeHtml(n.value || '') });
        }],
    ]);

    /**
     * Renders the AST into an HTML string.
     * @param ast The root node of the AST.
     * @returns The generated HTML string.
     */
    render(ast: ASTNode): VNode {
        return this.renderNode(ast);
    }

    /**
     * Renders a single node by looking up its handler.
     * If no handler is found, it falls back to rendering the node's children.
     * @param node The node to render.
     * @returns The HTML string for the node.
     */
    private renderNode(node: ASTNode): VNode {
        const handler = this.handlers.get(node.type);
        return handler ? handler(node) : this.renderChildren(node);
    }

    /**
     * Renders the children of a node and joins them into a single string.
     * If the node has no children, it returns the node's value (text content).
     * @param node The parent node.
     * @returns The concatenated HTML string of the children.
     */
    private renderChildren(node: ASTNode): VNode {
        if (!node.children || node.children.length === 0) {
            // Text nodes are also wrapped as VNodes
            return h(Fragment, [node.value || ''])
        }

        const childrenVNodes = node.children.map(c => this.renderNode(c))

        return h(Fragment, childrenVNodes)
    }
}

export {Renderer};
