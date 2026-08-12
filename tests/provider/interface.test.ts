import { describe, it, expect } from "vitest";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";

// 用一个 mock 实现验证接口契约（TS 接口是类型层的，这里用运行时实现 + 类型断言双重保障）
class FakeProvider implements LLMProvider {
    async generate(
        messages: Message[],
        tools: ToolDefinition[],
    ): Promise<Message> {
        return { role: "assistant", content: `got ${messages.length} msgs` };
    }
}

describe("LLMProvider 接口", () => {
    it("实现类满足 generate(messages, tools) → Promise<Message> 契约", async () => {
        const p: LLMProvider = new FakeProvider();
        const result = await p.generate(
            [{ role: "user", content: "hi" }],
            [{ name: "bash", description: "", inputSchema: {} }],
        );
        expect(result.role).toBe("assistant");
        expect(result.content).toBe("got 1 msgs");
    });

    it("generate 不接收 ctx（trace 走 AsyncLocalStorage，D3）", async () => {
        const p: LLMProvider = new FakeProvider();
        // 契约：generate(messages, tools)，无第三参 ctx
        const result = await p.generate([], []);
        expect(result).toBeDefined();
    });
});
