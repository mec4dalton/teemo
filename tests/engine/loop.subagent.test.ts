import { describe, it, expect } from "vitest";
import { AgentEngine } from "@/engine/loop.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition, ToolCall, ToolResult } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import type { Registry } from "@/tools/registry.js";

class MockProvider implements LLMProvider {
    private queue: Message[];
    constructor(responses: Message[]) {
        this.queue = [...responses];
    }
    async generate(_messages: Message[], _tools: ToolDefinition[]): Promise<Message> {
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

describe("AgentEngine.runSub", () => {
    it("不调工具时立即返回 content 作为汇报", async () => {
        const provider = new MockProvider([
            { role: RoleAssistant, content: "探索完毕：X 实现" },
        ]);
        const engine = new AgentEngine(
            provider,
            new MockRegistry({ toolCallId: "", output: "", isError: false }),
            false,
            false,
        );
        const summary = await engine.runSub(
            "查找 X",
            new MockRegistry({ toolCallId: "", output: "", isError: false }),
        );
        expect(summary).toBe("探索完毕：X 实现");
    });

    it("超过 10 轮仍调工具时强制召回（报错）", async () => {
        const looping: Message = {
            role: RoleAssistant,
            content: "",
            toolCalls: [{ id: "t", name: "bash", arguments: {} }],
        };
        const provider = new MockProvider(Array(15).fill(looping));
        const engine = new AgentEngine(
            provider,
            new MockRegistry({ toolCallId: "", output: "ok", isError: false }),
            false,
            false,
        );
        await expect(
            engine.runSub(
                "任务",
                new MockRegistry({ toolCallId: "", output: "ok", isError: false }),
            ),
        ).rejects.toThrow(/强制召回|超过/);
    });
});
