import { describe, it, expect } from "vitest";
import { assembleAgentEngine, parseAgentArgs } from "@/cmd/teemo/index.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import { Session } from "@/context/session.js";
import type { Price } from "@/config/schema.js";

const PRICING: Record<string, Price> = {
    "deepseek-v4-flash": { inputPrice: 1.5, outputPrice: 4.5 },
};

class FakeProvider implements LLMProvider {
    async generate(_m: Message[], _t: ToolDefinition[]): Promise<Message> {
        return { role: RoleAssistant, content: "done" };
    }
}

describe("parseAgentArgs", () => {
    it("解析 -prompt -dir -session", () => {
        const args = ["-prompt", "任务", "-dir", "/tmp", "-session", "s1"];
        const parsed = parseAgentArgs(args);
        expect(parsed?.prompt).toBe("任务");
        expect(parsed?.dir).toBe("/tmp");
        expect(parsed?.session).toBe("s1");
    });

    it("缺 -prompt 返回 null", () => {
        expect(parseAgentArgs(["-dir", "/tmp"])).toBeNull();
    });
});

describe("assembleAgentEngine", () => {
    it("组装 engine（provider+session+registry 4 工具）", () => {
        const session = new Session("s1", "/tmp");
        const { engine } = assembleAgentEngine(
            new FakeProvider(),
            "deepseek-v4-flash",
            PRICING,
            session,
            false,
        );
        expect(engine).toBeDefined();
    });
});
