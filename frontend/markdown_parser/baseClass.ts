/**
 * Types for blocks and handlers
 */

/**
 * Container class
 * Used to record intermediate variable replacements during global parsing
 */
class Container {
    private _container: { [key: string]: Block };
    private _counter: number;

    constructor() {
        this._container = {};
        this._counter = 0;
    }

    toString(): string {
        const splitLine = "-".repeat(50) + "\n";
        let info = `Total number: ${this._counter}\n\n`;

        for (const [k, v] of Object.entries(this._container)) {
            info += `[${k}]`.padEnd(30);
            if (v.input.word !== undefined) {
                info += " < word = " + v.input.word + " >";
            }
            info += "\n";
        }
        return splitLine + info + splitLine;
    }

    get(key: string): Block | undefined {
        return this._container[key];
    }

    register(classObject: Block): string {
        const _name = `${classObject.constructor.name}-${this._counter}`;
        this._counter += 1;
        this._container[_name] = classObject;
        return "{-%" + _name + "%-}";
    }
}

// Global container instance
declare global {
    let CONTAINER: Container;
}

/**
 * Handler method configuration
 */
interface HandlerMethod {
    object: Handler;
    priority: number;
}

/**
 * Parser base class
 */
class Parser {
    protected _handlers: HandlerMethod[] = [];
    public isSorted: boolean = false;

    /**
     * Sort handlers by priority (high to low)
     */
    protected _sort(): void {
        this._handlers.sort((a, b) => b.priority - a.priority);
    }

    info(): void {
        if (!this.isSorted) {
            this._sort();
        }
        for (const method of this._handlers) {
            const className = method.object.constructor.name;
            const priority = method.priority;
            console.log(`${className}: (${priority})`);
        }
    }

    register(handler: Handler, priority: number = 0): void {
        handler.parser = this;
        const newMethod = {priority: priority, object: handler};
        this._handlers.push(newMethod);
    }

    match(root: Block, text: string): void {
        throw new Error("Method not implemented");
    }
}

/**
 * Block base class
 * Represents a parsed markdown block element
 */
interface BlockInput {
    text: string;
    word: string;

    [key: string]: any;
}

class Block {
    public input: BlockInput;
    public subBlocks: Block[] = [];
    public blockName: string;

    constructor(options: BlockInput) {
        this.input = options;
        this.blockName = this.constructor.name;
    }

    register(classObject: Block): string {
        return CONTAINER.register(classObject);
    }

    restore(TextBlock: new (options: Record<string, any>) => Block): void {
        const RE: RegExp = /{-%.*?%-}/;
        const splitStrings: string[] = this.input.word?.toString().split(RE) || [];
        let count: number = 0;

        for (const str of splitStrings) {
            if (count % 2 === 0) {
                if (str) {
                    this.addBlock(new TextBlock({word: str, text: str})); // need a TextBlock Class
                }
            } else {
                const id: string = str.slice(3, -3);
                const classObject: Block = CONTAINER.get(id);
                classObject.restore(TextBlock)
                this.input.text = (this.input.text as string).replace(str, classObject.input.text as string);
                this.addBlock(classObject);
            }
            count++;
        }
    }

    addBlock(block: Block): void {
        this.subBlocks.push(block);
    }

    toString(): string {
        if (!this.input) {
            return "";
        }
        let output = "< ";
        for (const [k, v] of Object.entries(this.input)) {
            if (k === "text") {
                continue;
            }
            output += `${k} = "${v}" | `;
        }
        if (output === "< ") {
            output = "";
        } else {
            output = output.slice(0, -3) + " >";
        }
        return output;
    }

    info(deep: number = 0): void {
        if (this.subBlocks.length === 0) {
            return;
        } else {
            for (const block of this.subBlocks) {
                console.log(" ".repeat(4 * deep) + `[${block.constructor.name}] ${block.toString()}`);
                block.info(deep + 1);
            }
        }
    }

    printInfo(deep: number = 0): string {
        let outputStr = "";
        if (this.subBlocks.length === 0) {
            return outputStr;
        } else {
            for (const block of this.subBlocks) {
                outputStr += " ".repeat(4 * deep);
                outputStr += `[${block.constructor.name}] ${block.toString()}\n`;
                outputStr += block.printInfo(deep + 1);
            }
            return outputStr;
        }
    }

    toHtml(headerNavigate?: string): string {
        let content = "";
        for (const block of this.subBlocks) {
            content += block.toHtml();
        }
        if (headerNavigate) {
            return `${headerNavigate}<div class='markdown-body'>${content}</div>`;
        } else {
            return `<div class='markdown-body'>${content}</div>`;
        }
    }

    toDisplayWord(): string {
        if (this.input.word !== undefined) {
            return this.input.word.toString();
        } else if (this.input.text !== undefined) {
            return this.input.text.toString();
        } else {
            return "";
        }
    }

    toText(): string {
        if (this.input.text) {
            return this.input.text.toString();
        } else {
            return "";
        }
    }
}

/**
 * Handler base class
 * For processing specific patterns in text
 */
class Handler {
    public RE: RegExp | null = null;
    public parser: Parser | null = null;

    match(text: string, ...args: any[]): boolean {
        if (this.RE === null) {
            throw new Error("RegExp pattern not implemented");
        }
        return this.RE.test(text);
    }

    call(root: Block, text: string): void {
        throw new Error("Method not implemented");
    }
}

/**
 * Optimizer base class
 * For optimizing processed blocks
 */
class Optimizer {
    public targetBlockNames: string[] = [];
    public parser: Parser | null = null;

    call(root: Block): void {
        throw new Error("Method not implemented");
    }
}

export {
    Container,
    CONTAINER,
    Parser,
    Block,
    Handler,
    Optimizer,
    BlockInput
};