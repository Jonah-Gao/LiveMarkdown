import {Token, TokenType} from './types.ts';

interface ASTNode {
    type: TokenType;
    children?: ASTNode[];
    value?: string;
    attributes?: Record<string, string|number|boolean>;
}

class Parser {
    parse(tokens: Token[]): ASTNode {
        const root: ASTNode = {type: TokenType.BODY, children: []};

        for (const token of tokens) {
            const node: ASTNode = this.parseToken(token);
            root.children!.push(node);
        }

        return root;
    }

    // private readonly attributeKeys: string[] = [
    //     'depth',    // 标题层级
    //     'href',     // 链接地址
    //     'lang',     // 代码语言
    //     'ordered',  // 是否有序列表
    //     'start',    // 有序列表起始
    //     'indent',   // 缩进层级
    //     'title',    // 链接/图片标题
    //     'align',    // 表格对齐方式
    // ];

    private extractAttributes(token: Token): Record<string, any> | undefined {
        const entries = Object.entries(token);
        // const attrs = this.attributeKeys.reduce((acc, key) => {
        //     if ((token as any)[key] !== undefined) {
        //         acc[key] = (token as any)[key];
        //     }
        //     return acc;
        // }, {} as Record<string, any>);
        //
        // return Object.keys(attrs).length > 0 ? attrs : undefined;
        if (entries.length === 0) {
            return undefined;
        }
        return Object.fromEntries(entries);
    }

    private parseToken(token: Token): ASTNode {
        // 递归处理嵌套 token
        if (token.tokens?.length) {
            return {
                type: token.type,
                children: token.tokens.map(t => this.parseToken(t)),
                attributes: this.extractAttributes(token),
            };
        }

        return {
            type: token.type,
            value: token.text || token.raw,
            attributes: this.extractAttributes(token),
        };
    }
}

export {Parser};
export type {ASTNode}