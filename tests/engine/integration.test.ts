import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { AgentEngine } from "@/engine/loop.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition, ToolCall, ToolResult } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import { Session } from "@/context/session.js";
import type { Registry } from "@/tools/registry.js";

class MockProvider implements LLMProvider {
    private queue: Message[];
    constructor(responses: Message[]) {
        this.queue = [...responses];
    }
    async generate(_m: Message[], _t: ToolDefinition[]): Promise<Message> {
        return this.queue.shift() ?? { role: RoleAssistant, content: "" };
    }
}

class MockRegistry implements Registry {
    constructor(private result: ToolResult, private tools: ToolDefinition[] = []) {}
    register(): void {}
    use(): void {}
    getAvailableTools(): ToolDefinition[] {
        return this.tools;
    }
    async execute(call: ToolCall): Promise<ToolResult> {
        return { ...this.result, toolCallId: call.id };
    }
}

describe("engine 全链路集成", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-engine-int-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("ReAct 多轮：toolCalls → 执行 → 再思考 → 完成，trace 落盘", async () => {
        const provider = new MockProvider([
            {
                role: RoleAssistant,
                content: "",
                toolCalls: [{ id: "t1", name: "bash", arguments: { command: "ls" } }],
            },
            { role: RoleAssistant, content: "任务完成" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "file-a\nfile-b",
            isError: false,
        });
        const engine = new AgentEngine(provider, registry, false, false);
        const session = new Session("int", workDir);

        await engine.run(session, null);

        const mem = session.getWorkingMemory(50);
        // 最终应有 "任务完成"
        expect(mem.some((m) => m.content === "任务完成")).toBe(true);
        // 工具结果应回填 session（observation：toolCallId + 工具输出）
        expect(
            mem.some((m) => m.toolCallId === "t1" && m.content === "file-a\nfile-b"),
        ).toBe(true);
        // trace 文件落盘
        const tracesDir = path.join(workDir, ".teemo", "traces");
        const files = await fs.readdir(tracesDir);
        const traceFile = files.find((f) => f.startsWith("trace_int_"));
        expect(traceFile).toBeDefined();
        const trace = JSON.parse(
            await fs.readFile(path.join(tracesDir, traceFile!), "utf-8"),
        );
        expect(trace.name).toBe("Agent.Run");
        // 应有 Turn-1 子 span
        expect(
            trace.children.some((s: { name: string }) => s.name.startsWith("Turn-")),
        ).toBe(true);
    });

    it("runLoop 抛错时 trace 仍落盘（spec「成功或失败」）", async () => {
        const throwingProvider: LLMProvider = {
            generate: async () => {
                throw new Error("provider 炸了");
            },
        };
        const engine = new AgentEngine(
            throwingProvider,
            new MockRegistry({ toolCallId: "", output: "", isError: false }),
            false,
            false,
        );
        const session = new Session("intfail", workDir);
        await expect(engine.run(session, null)).rejects.toThrow("provider 炸了");
        // onEnd 保证失败也 export，trace 仍落盘
        const tracesDir = path.join(workDir, ".teemo", "traces");
        const files = await fs.readdir(tracesDir);
        expect(files.some((f) => f.startsWith("trace_intfail_"))).toBe(true);
    });
});
