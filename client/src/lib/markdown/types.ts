/**
 * Enum representing the different types of tokens supported by the markdown parser.
 * Using const enum for performance optimization (inlined at compile time).
 */
const enum TokenType {
    BODY = 'body',
    HEADING = 'heading',
    PARAGRAPH = 'paragraph',
    CODE_BLOCK = 'code_block',
    INDENTED_CODE_BLOCK = 'indented_code_block',
    CODE_INLINE = 'code_inline',
    BOLD = 'bold',
    ITALIC = 'italic',
    BOLD_ITALIC = 'bold_italic',
    LINK = 'link',
    IMAGE = 'image',
    ULIST = 'ulist',
    OLIST = 'olist',
    LIST_ITEM = 'list_item',
    BLOCKQUOTE = 'blockquote',
    HR = 'hr',
    TEXT = 'text',
    NEWLINE = 'newline',
    SOFTBREAK = 'softbreak',
    HARDBREAK = 'hardbreak',
    PARAGRAPHBREAK = 'paragraphbreak',
}

/**
 * Base interface for all tokens.
 * Uses a generic constraint to ensure type safety for the token type.
 */
interface BaseToken<T extends TokenType = TokenType> {
    readonly type: T;
    raw: string;        // The raw markdown string for this token
    text?: string;      // The text content of the token (if applicable)
    tokens?: Token[];   // Nested tokens (for block tokens that contain inline tokens)
}

/**
 * Token representing a heading (h1-h6).
 */
interface HeadingToken extends BaseToken<TokenType.HEADING> {
    readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Token representing a code block.
 */
interface CodeBlockToken extends BaseToken<TokenType.CODE_BLOCK> {
    readonly lang: string; // The programming language for syntax highlighting
}

interface IndentedCodeBlockToken extends BaseToken<TokenType.INDENTED_CODE_BLOCK> {
}

/**
 * Common interface for tokens that have a link destination (links and images).
 */
interface LinkableToken<T extends TokenType> extends BaseToken<T> {
    readonly href: string;
    readonly title?: string;
}

interface LinkToken extends LinkableToken<TokenType.LINK> {
}

interface ImageToken extends LinkableToken<TokenType.IMAGE> {
    readonly alt: string;
}

/**
 * Token representing a list (ordered or unordered).
 */
interface OListToken extends BaseToken<TokenType.OLIST> {
    readonly start?: number;   // Starting number for ordered lists
    readonly loose?: boolean;  // True if list items are separated by newlines (loose list)
}

interface UListToken extends BaseToken<TokenType.ULIST> {
    readonly loose?: boolean;  // True if list items are separated by newlines (loose list)
}

/**
 * Token representing a single item in a list.
 */
interface ListItemToken extends BaseToken<TokenType.LIST_ITEM> {
    readonly indent: number;   // Indentation level
    readonly checked?: boolean; // For task lists (not fully implemented yet)
    readonly loose?: boolean;  // True if this item contains multiple blocks or is in a loose list
}

// Inline text types
type InlineTextType =
    TokenType.TEXT
    | TokenType.BOLD
    | TokenType.ITALIC
    | TokenType.BOLD_ITALIC
    | TokenType.CODE_INLINE
    | TokenType.HARDBREAK
    | TokenType.SOFTBREAK;

interface TextToken extends BaseToken<InlineTextType> {
    readonly type: InlineTextType;
}

// Simple types
type SimpleTokenType =
    TokenType.HR
    | TokenType.BLOCKQUOTE
    | TokenType.PARAGRAPH
    | TokenType.BODY
    | TokenType.PARAGRAPHBREAK
    | TokenType.NEWLINE;

interface SimpleToken extends BaseToken<SimpleTokenType> {
    readonly type: SimpleTokenType;
}

// Union type
type Token =
    | HeadingToken
    | CodeBlockToken
    | IndentedCodeBlockToken
    | LinkToken
    | ImageToken
    | UListToken
    | OListToken
    | ListItemToken
    | TextToken
    | SimpleToken;

// Type guard utility function
const isTokenType = <T extends Token>(
    token: Token,
    type: T['type']
): token is T => token.type === type;

// Common type guards
const isHeading = (token: Token): token is HeadingToken =>
    token.type === TokenType.HEADING;

const isCodeBlock = (token: Token): token is CodeBlockToken =>
    token.type === TokenType.CODE_BLOCK;

const isLink = (token: Token): token is LinkToken =>
    token.type === TokenType.LINK;

const isUList = (token: Token): token is UListToken =>
    token.type === TokenType.ULIST;

const isOList = (token: Token): token is OListToken =>
    token.type === TokenType.OLIST;

export {TokenType, isTokenType, isHeading, isCodeBlock, isLink, isUList, isOList};
export type {
    Token,
    BaseToken,
    HeadingToken,
    CodeBlockToken,
    LinkToken,
    ImageToken,
    UListToken,
    OListToken,
    ListItemToken,
    TextToken,
    SimpleToken
};