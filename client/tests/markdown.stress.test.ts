import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { MarkdownParser } from "@markdown/markdown";

vi.mock("dompurify", () => ({
    default: {
        sanitize: (input: string) => input
    }
}));

const RUNS = 5;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runStressCase(fixturePath: string, label: string) {
    const input = readFileSync(resolve(__dirname, fixturePath), "utf-8");
    const durationsMs: number[] = [];
    const memoryDeltaRssBytes: number[] = [];
    let output = "";

    for (let i = 0; i < RUNS; i++) {
        const parser = new MarkdownParser();
        const memoryBefore = process.memoryUsage();
        const startTime = performance.now();
        output = parser.render(input);
        const durationMs = performance.now() - startTime;
        const memoryAfter = process.memoryUsage();

        durationsMs.push(durationMs);
        memoryDeltaRssBytes.push(Math.max(0, memoryAfter.rss - memoryBefore.rss));
    }

    const avgDurationMs = durationsMs.reduce((sum, value) => sum + value, 0) / RUNS;
    const avgRssDeltaMB =
        memoryDeltaRssBytes.reduce((sum, value) => sum + value, 0) / RUNS / 1024 / 1024;

    console.info(
        `[markdown stress] ${label} | runs=${RUNS} | avgTime=${avgDurationMs.toFixed(2)}ms | avgRssDelta=${avgRssDeltaMB.toFixed(2)}MB`
    );

    expect(output.length).toBeGreaterThan(0);
    expect(Number.isFinite(avgDurationMs)).toBe(true);
}

describe("Markdown parser stress tests", () => {
    it("times and measures memory for general-stress-test fixture", () => {
        runStressCase("./fixtures/general-stress-test.md", "general-stress-test.md");
    });

    it("times and measures memory for Les Miserables fixture", () => {
        runStressCase("./fixtures/Les Miserables.md", "Les Miserables.md");
    });
});
