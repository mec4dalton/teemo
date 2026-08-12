import { describe, it, expect } from "vitest";
import { SubagentTool, type AgentRunner } from "@/tools/subagent.js";
import type { Registry } from "@/tools/registry.js";
import type { ToolDefinition, ToolCall } from "@/schema/message.js";

class MockRunner implements AgentRunner {
    receivedPrompt = "";
    async runSub(taskPrompt: string): Promise<string> {
        this.receivedPrompt = taskPrompt;
        return "子智能体探索报告：发现 A 与 B";
    }
}

class MockReadOnlyRegistry implements Registry {
    getAvailableTools(): ToolDefinition[] {
        return [];
    }
    register(): void {}
    use(): void {}
    async execute(_call: ToolCall): Promise<{ toolCallId: string; output: string; isError: boolean }> {
        throw new Error("不应调用");
    }
}

describe("SubagentTool", () => {
    it("name/definition 正确", () => {
        const t = new SubagentTool(new MockRunner(), new MockReadOnlyRegistry());
        expect(t.name()).toBe("spawn_subagent");
        expect(t.definition().name).toBe("spawn_subagent");
        expect(t.definition().inputSchema).toBeDefined();
    });

    it("execute 调 runner.runSub 并返回【子智能体探索报告】", async () => {
        const runner = new MockRunner();
        const t = new SubagentTool(runner, new MockReadOnlyRegistry());
        const out = await t.execute({ task_prompt: "查找 auth 逻辑" });
        expect(runner.receivedPrompt).toBe("查找 auth 逻辑");
        expect(out).toContain("【子智能体探索报告】");
        expect(out).toContain("发现 A 与 B");
    });

    it("缺 task_prompt 抛错", async () => {
        const t = new SubagentTool(new MockRunner(), new MockReadOnlyRegistry());
        await expect(t.execute({})).rejects.toThrow();
    });
});
