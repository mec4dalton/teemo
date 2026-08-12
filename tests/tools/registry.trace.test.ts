import { describe, it, expect } from "vitest";
import { newRegistry, type BaseTool } from "@/tools/registry.js";
import type { ToolCall, ToolDefinition } from "@/schema/message.js";
import {
    withSpan,
    type Span,
} from "@/observability/trace.js";

function fakeTool(n: string): BaseTool {
    return {
        name: () => n,
        definition: (): ToolDefinition => ({
            name: n,
            description: "fake",
            inputSchema: { type: "object" },
        }),
        execute: async () => "ok",
    };
}

describe("registry trace 埋点", () => {
    it("execute 在 tool.<name> Span 内执行（埋点挂到父 Span）", async () => {
        const r = newRegistry();
        r.register(fakeTool("read_file"));

        let root: Span | null = null;
        await withSpan("turn", async (span) => {
            root = span;
            await r.execute({
                id: "c1",
                name: "read_file",
                arguments: {},
            } satisfies ToolCall);
        });

        // registry.execute 应在 "tool.read_file" Span 内，挂到 root.children
        const toolSpan = root!.children.find((s) => s.name === "tool.read_file");
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.endTime).toBeGreaterThan(0);
    });

    it("Phase 0+1 的 registry 契约不变（埋点不影响 ToolResult）", async () => {
        const r = newRegistry();
        r.register(fakeTool("a"));
        const res = await r.execute({ id: "c1", name: "a", arguments: {} });
        expect(res.isError).toBe(false);
        expect(res.output).toBe("ok");
    });
});
