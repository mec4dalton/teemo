import { describe, it, expect } from "vitest";
import { PROTOCOLS, isTeemoConfig } from "@/config/schema.js";

describe("isTeemoConfig", () => {
    const valid = {
        protocol: "openai",
        baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
        model: "glm-4.5-air",
        apiKey: "$ZHIPU_API_KEY",
        pricing: { "glm-4.5-air": { inputPrice: 0.15, outputPrice: 0.15 } },
    };

    it("合法配置返回 true", () => {
        expect(isTeemoConfig(valid)).toBe(true);
    });

    it("protocol 非法返回 false", () => {
        expect(isTeemoConfig({ ...valid, protocol: "gemini" })).toBe(false);
    });

    it("缺任一顶层字段返回 false", () => {
        for (const key of ["protocol", "baseURL", "model", "apiKey", "pricing"]) {
            const broken = { ...valid } as Record<string, unknown>;
            delete broken[key];
            expect(isTeemoConfig(broken)).toBe(false);
        }
    });

    it("pricing 价格缺字段返回 false", () => {
        const broken = {
            ...valid,
            pricing: { "glm-4.5-air": { inputPrice: 0.15 } },
        };
        expect(isTeemoConfig(broken)).toBe(false);
    });

    it("PROTOCOLS 常量包含两种协议", () => {
        expect(PROTOCOLS).toEqual(["openai", "claude"]);
    });
});
