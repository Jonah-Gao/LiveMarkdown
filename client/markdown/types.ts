// Token 类型枚举 - 使用 const enum 提升性能（编译时内联）
const enum TokenType {
    BODY = 'body',
    HEADING = 'heading',
    PARAGRAPH = 'paragraph',
    CODE_BLOCK = 'code_block',
    CODE_INLINE = 'code_inline',
    BOLD = 'bold',
    ITALIC = 'italic',
    BOLD_ITALIC = 'bold_italic',
    LINK = 'link',
    IMAGE = 'image',
    LIST = 'list',
    LIST_ITEM = 'list_item',
    BLOCKQUOTE = 'blockquote',
    HR = 'hr',
    TEXT = 'text',
    NEWLINE = 'newline',
    SOFTBREAK = 'softbreak',
    HARDBREAK = 'hardbreak',
    PARAGRAPHBREAK = 'paragraphbreak',
}

// 基础 Token - 使用泛型约束 type
interface BaseToken<T extends TokenType = TokenType> {
    readonly type: T;
    readonly raw: string;
    text?: string;
    tokens?: Token[];
}

// 各类型专属 Token
interface HeadingToken extends BaseToken<TokenType.HEADING> {
    readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
}

interface CodeBlockToken extends BaseToken<TokenType.CODE_BLOCK> {
    readonly lang: string;
}

// 提取共用接口
interface LinkableToken<T extends TokenType> extends BaseToken<T> {
    readonly href: string;
    readonly title?: string;
}

interface LinkToken extends LinkableToken<TokenType.LINK> {
}

interface ImageToken extends LinkableToken<TokenType.IMAGE> {
    readonly alt: string;
}

interface ListToken extends BaseToken<TokenType.LIST> {
    readonly ordered: boolean;
    readonly start?: number;
}

interface ListItemToken extends BaseToken<TokenType.LIST_ITEM> {
    readonly indent: number;
    readonly checked?: boolean;
}

// 内联文本类型
type InlineTextType = TokenType.TEXT | TokenType.BOLD | TokenType.ITALIC | TokenType.BOLD_ITALIC | TokenType.CODE_INLINE | TokenType.HARDBREAK | TokenType.SOFTBREAK;

interface TextToken extends BaseToken<InlineTextType> {
    readonly type: InlineTextType;
}

// 简单类型
type SimpleTokenType = TokenType.HR | TokenType.BLOCKQUOTE | TokenType.PARAGRAPH | TokenType.BODY | TokenType.PARAGRAPHBREAK | TokenType.NEWLINE;

interface SimpleToken extends BaseToken<SimpleTokenType> {
    readonly type: SimpleTokenType;
}

// 联合类型
type Token =
    | HeadingToken
    | CodeBlockToken
    | LinkToken
    | ImageToken
    | ListToken
    | ListItemToken
    | TextToken
    | SimpleToken;

// 类型守卫工具函数
const isTokenType = <T extends Token>(
    token: Token,
    type: T['type']
): token is T => token.type === type;

// 常用类型守卫
const isHeading = (token: Token): token is HeadingToken =>
    token.type === TokenType.HEADING;

const isCodeBlock = (token: Token): token is CodeBlockToken =>
    token.type === TokenType.CODE_BLOCK;

const isLink = (token: Token): token is LinkToken =>
    token.type === TokenType.LINK;

const isList = (token: Token): token is ListToken =>
    token.type === TokenType.LIST;

export {TokenType, isTokenType, isHeading, isCodeBlock, isLink, isList};
export type {
    Token,
    BaseToken,
    HeadingToken,
    CodeBlockToken,
    LinkToken,
    ImageToken,
    ListToken,
    ListItemToken,
    TextToken,
    SimpleToken
};