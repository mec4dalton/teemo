import { describe, it, expect } from "vitest";
import { AgentEngine } from "@/engine/loop.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition, ToolCall, ToolResult } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import { Session } from "@/context/session.js";
import type { Registry } from "@/tools/registry.js";

// 可编程 mock provider：按序返回预设响应
class MockProvider implements LLMProvider {
    private queue: Message[];
    private seen: Message[][] = [];
    constructor(responses: Message[]) {
        this.queue = [...responses];
    }
    async generate(messages: Message[], _tools: ToolDefinition[]): Promise<Message> {
        this.seen.push(messages);
        return this.queue.shift() ?? { role: RoleAssistant, content: "" };
    }
    seenLength(): number {
        return this.seen.length;
    }
    seenAt(i: number): Message[] {
        return this.seen[i];
    }
}

// mock registry：execute 返回固定 result；可选 tool 定义
class MockRegistry implements Registry {
    constructor(
        private result: ToolResult,
        private tools: ToolDefinition[] = [],
    ) {}
    register(): void {}
    use(): void {}
    getAvailableTools(): ToolDefinition[] {
        return this.tools;
    }
    async execute(call: ToolCall): Promise<ToolResult> {
        return { ...this.result, toolCallId: call.id };
    }
}

describe("AgentEngine.run", () => {
    it("Action 无 toolCalls 时退出循环（单轮即停）", async () => {
        const provider = new MockProvider([
            { role: RoleAssistant, content: "done" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "",
            isError: false,
        });
        const engine = new AgentEngine(provider, registry, false, false);
        const session = new Session("s1", "/tmp");
        await engine.run(session, null);
        const mem = session.getWorkingMemory(20);
        expect(
            mem.some((m) => m.role === "assistant" && m.content.includes("done")),
        ).toBe(true);
    });

    it("Action 返回 toolCalls → 并发执行工具 → 回填 observation → 下一轮无 toolCalls 退出", async () => {
        const provider = new MockProvider([
            {
                role: RoleAssistant,
                content: "",
                toolCalls: [
                    { id: "t1", name: "bash", arguments: { command: "ls" } },
                    { id: "t2", name: "read_file", arguments: { path: "a" } },
                ],
            },
            { role: RoleAssistant, content: "all done" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "tool-output",
            isError: false,
        });
        const engine = new AgentEngine(provider, registry, false, false);
        const session = new Session("s1", "/tmp");
        await engine.run(session, null);
        const mem = session.getWorkingMemory(20);
        const toolResults = mem.filter((m) => m.toolCallId);
        expect(toolResults).toHaveLength(2);
        expect(mem.some((m) => m.content === "all done")).toBe(true);
    });

    it("EnableThinking 时 thinking 拼入 Action 输入上下文（Action 模型能看到推理）", async () => {
        const provider = new MockProvider([
            { role: RoleAssistant, content: "我在思考..." },
            { role: RoleAssistant, content: "action-done" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "",
            isError: false,
        });
        const engine = new AgentEngine(provider, registry, true, false);
        const session = new Session("s1", "/tmp");
        await engine.run(session, null);
        // 第 2 次 generate（Action）的输入应含 thinking 内容（拼入 Action 上下文）
        const actionMessages = provider.seenAt(1);
        expect(
            actionMessages.some((m) => m.role === "assistant" && m.content === "我在思考..."),
        ).toBe(true);
    });

    it("Dummy User：WorkingMemory 首条非 User 时注入占位符", async () => {
        const session = new Session("s1", "/tmp");
        session.append({ role: RoleAssistant, content: "历史回复" });
        const provider = new MockProvider([
            { role: RoleAssistant, content: "continue" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "",
            isError: false,
        });
        const engine = new AgentEngine(provider, registry, false, false);
        await engine.run(session, null);
        const firstCallMessages = provider.seenAt(0);
        expect(
            firstCallMessages.some((m) => m.content.includes("系统占位符")),
        ).toBe(true);
    });

    it("单个工具失败不中断其他工具（registry 不抛错契约）", async () => {
        const provider = new MockProvider([
            {
                role: RoleAssistant,
                content: "",
                toolCalls: [
                    { id: "t1", name: "bash", arguments: {} },
                    { id: "t2", name: "bash", arguments: {} },
                ],
            },
            { role: RoleAssistant, content: "after-errors" },
        ]);
        const registry = new MockRegistry({
            toolCallId: "",
            output: "failed",
            isError: true,
        });
        const engine = new AgentEngine(provider, registry, false, false);
        const session = new Session("s1", "/tmp");
        await engine.run(session, null);
        const mem = session.getWorkingMemory(20);
        expect(mem.filter((m) => m.toolCallId)).toHaveLength(2);
    });
});
