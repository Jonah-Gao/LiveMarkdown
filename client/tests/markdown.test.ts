import { describe, it, expect } from "vitest";
import cases from "./fixtures/commonmark-0.31.2-filtered.json";
import { MarkdownParser } from "@markdown/markdown";

import type { Case } from "./types";

import { JSDOM } from "jsdom";

const PRESERVE_WHITESPACE = new Set(["PRE", "CODE", "TEXTAREA"]);
const markdown = new MarkdownParser();

function normalizeTextNodes(node: Node) {
    if (node.nodeType === node.TEXT_NODE) {
        const parent = node.parentNode as Element | null;
        if (parent && !PRESERVE_WHITESPACE.has(parent.tagName)) {
            node.nodeValue = node.nodeValue!.replace(/\s+/g, " ").trim();
        }
    }

    node.childNodes.forEach(normalizeTextNodes);
}

function normalizeDom(html: string): HTMLElement {
    const dom = new JSDOM(`<body>${html}</body>`);
    const body = dom.window.document.body;
    normalizeTextNodes(body);
    body.normalize();
    return body;
}

function domEqual(a: string, b: string): boolean {
    const A = normalizeDom(a);
    const B = normalizeDom(b);
    return A.isEqualNode(B);
}

describe.each(cases as Case[])("markdown example $example ($section)", (c) => {
    it(`renders example ${c.example}: ${c.markdown.replace(/\n/g, "\\n")}`, () => {
        const actual = markdown.render(c.markdown);
        const expected = c.html;

        expect(
            domEqual(actual, expected),
            `DOM mismatch\n\nActual:\n${actual}\n\nExpected:\n${expected}`
        ).toBe(true);
    });
});
