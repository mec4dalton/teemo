import { describe, it, expect } from "vitest";
import { CostTracker, PRICING_MODEL } from "@/observability/tracker.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";
import { Session } from "@/context/session.js";

// 假 provider：返回固定 usage
class FakeProvider implements LLMProvider {
    async generate(
        _messages: Message[],
        _tools: ToolDefinition[],
    ): Promise<Message> {
        return {
            role: "assistant",
            content: "ok",
            usage: { promptTokens: 100, completionTokens: 50 },
        };
    }
}

describe("PRICING_MODEL", () => {
    it("glm-4.5-air 定价存在", () => {
        expect(PRICING_MODEL["glm-4.5-air"]).toBeDefined();
        expect(PRICING_MODEL["glm-4.5-air"].inputPrice).toBeGreaterThan(0);
    });
});

describe("CostTracker", () => {
    it("implements LLMProvider（可替换真实 provider）", () => {
        const tracker = new CostTracker(new FakeProvider(), "glm-4.5-air", null);
        // 仅验证类型契约（运行时由 generate 测试）
        expect(typeof tracker.generate).toBe("function");
    });

    it("generate 透传 next provider 的响应（content 不变）", async () => {
        const tracker = new CostTracker(new FakeProvider(), "glm-4.5-air", null);
        const result = await tracker.generate(
            [{ role: "user", content: "hi" }] as Message[],
            [],
        );
        expect(result.content).toBe("ok");
        expect(result.usage?.promptTokens).toBe(100);
    });

    it("generate 按 PricingModel 算花费并写入 Session.recordUsage", async () => {
        const session = new Session("s1", "/tmp");
        const tracker = new CostTracker(new FakeProvider(), "glm-4.5-air", session);
        await tracker.generate([{ role: "user", content: "hi" }] as Message[], []);
        // 100 input + 50 output，价格 0.15/0.15 元/百万 token
        // cost = (100*0.15 + 50*0.15) / 1_000_000 = 22.5e-6
        expect(session.totalPromptTokens).toBe(100);
        expect(session.totalCompletionTokens).toBe(50);
        expect(session.totalCostCNY).toBeCloseTo(22.5e-6, 10);
    });

    it("未知 model 不计费但透传响应（不抛错）", async () => {
        const session = new Session("s1", "/tmp");
        const tracker = new CostTracker(new FakeProvider(), "unknown-model", session);
        const result = await tracker.generate([], []);
        expect(result.content).toBe("ok");
        expect(session.totalCostCNY).toBe(0);
    });
});
