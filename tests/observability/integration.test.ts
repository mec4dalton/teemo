import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { ClaudeProvider } from "@/provider/claude.js";
import { CostTracker } from "@/observability/tracker.js";
import { withSpan, exportTraceToFile, type Span } from "@/observability/trace.js";
import { Session } from "@/context/session.js";

function fakeFetch(responseBody: unknown) {
    return async () =>
        new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
}

const RESPONSE = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    model: "glm-4.5-air",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
};

describe("provider + observability 集成", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-pov-int-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("CostTracker 装饰 ClaudeProvider，调 LLM 时在 trace Span 内计费", async () => {
        const session = new Session("int", workDir);
        const provider = new ClaudeProvider("glm-4.5-air", {
            fetch: fakeFetch(RESPONSE),
        });
        const tracked = new CostTracker(provider, "glm-4.5-air", session);

        let root: Span | null = null;
        await withSpan("turn", async (span) => {
            root = span;
            await tracked.generate([{ role: "user", content: "hi" }], []);
        });

        // 计费写入 session（真数据流：tracked→provider→mock fetch→usage→recordCost→session）
        expect(session.totalPromptTokens).toBe(100);
        expect(session.totalCostCNY).toBeGreaterThan(0);
        // turn Span 存在
        expect(root!.name).toBe("turn");
    });

    it("exportTraceToFile 落盘 turn Span 树", async () => {
        let root: Span | null = null;
        await withSpan("turn", async (span) => {
            root = span;
        });
        const file = await exportTraceToFile(root!, workDir, "int");
        const content = await fs.readFile(file, "utf-8");
        expect(JSON.parse(content).name).toBe("turn");
    });
});
