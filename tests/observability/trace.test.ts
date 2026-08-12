import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import {
    startSpan,
    endSpan,
    addAttribute,
    withSpan,
    exportTraceToFile,
    type Span,
} from "@/observability/trace.js";

describe("trace Span 树", () => {
    it("withSpan 创建 Span 并执行 fn，finally 自动 EndSpan", async () => {
        let captured: Span | null = null;
        await withSpan("root", async (span) => {
            captured = span;
            expect(endSpanFinished(captured)).toBe(false);
        });
        // withSpan 结束后 span 已 EndSpan（durationMs 已算）
        expect(captured!.endTime).toBeGreaterThan(0);
        expect(captured!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("嵌套 withSpan 把子 Span 挂到父 Span.children（AsyncLocalStorage 串联，D3）", async () => {
        let rootSpan: Span | null = null;
        await withSpan("root", async (root) => {
            rootSpan = root;
            await withSpan("child", async () => {
                // 子 span 自动挂到 root.children
            });
        });
        expect(rootSpan!.children).toHaveLength(1);
        expect(rootSpan!.children[0].name).toBe("child");
    });

    it("addAttribute 写入 span.attributes", async () => {
        let s: Span | null = null;
        await withSpan("root", async (span) => {
            s = span;
            addAttribute(span, "command", "ls");
        });
        expect(s!.attributes.command).toBe("ls");
    });

    it("exportTraceToFile 把 Span 树落盘为 JSON（O3，文件名含时间戳）", async () => {
        const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-trace-"));
        try {
            let root: Span | null = null;
            await withSpan("root", async (span) => {
                root = span;
                await withSpan("child", async () => {});
            });
            const file = await exportTraceToFile(root!, workDir, "sess1");
            expect(file).toContain("trace_sess1_");
            expect(file).toContain(".json");
            const content = await fs.readFile(file, "utf-8");
            const parsed = JSON.parse(content);
            expect(parsed.name).toBe("root");
            expect(parsed.children).toHaveLength(1);
        } finally {
            await fs.rm(workDir, { recursive: true, force: true });
        }
    });
});

// 辅助：判断 span 是否已 EndSpan（endTime > 0）
function endSpanFinished(span: Span | null): boolean {
    return span !== null && span.endTime > 0;
}
