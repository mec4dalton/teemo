import { describe, it, expect } from "vitest";
import { createProvider } from "@/provider/factory.js";
import { OpenAIProvider } from "@/provider/openai.js";
import { ClaudeProvider } from "@/provider/claude.js";
import type { TeemoConfig } from "@/config/schema.js";

const BASE: Pick<TeemoConfig, "baseURL" | "model" | "apiKey"> = {
    baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
    model: "glm-4.5-air",
    apiKey: "sk-test",
};

describe("createProvider", () => {
    it("protocol=openai 返回 OpenAIProvider", () => {
        const p = createProvider({ ...BASE, protocol: "openai" });
        expect(p).toBeInstanceOf(OpenAIProvider);
    });

    it("protocol=claude 返回 ClaudeProvider", () => {
        const p = createProvider({
            ...BASE,
            protocol: "claude",
            baseURL: "https://open.bigmodel.cn/api/anthropic",
        });
        expect(p).toBeInstanceOf(ClaudeProvider);
    });

    it("protocol 非法 throw", () => {
        expect(() =>
            createProvider({ ...BASE, protocol: "gemini" as TeemoConfig["protocol"] }),
        ).toThrow(/protocol/);
    });
});
