import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "@/provider/openai.js";
import type { Message } from "@/schema/message.js";

function fakeFetch(responseBody: unknown) {
    return async () =>
        new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
}

const TEXT_RESPONSE = {
    choices: [
        { message: { role: "assistant", content: "你好" }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const TOOL_RESPONSE = {
    choices: [
        {
            message: {
                role: "assistant",
                content: "",
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: { name: "bash", arguments: '{"command":"ls"}' },
                    },
                ],
            },
            finish_reason: "tool_calls",
        },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 3 },
};

describe("OpenAIProvider", () => {
    beforeEach(() => {
        // openai SDK 构造期守卫要求 apiKey 非空（不认 fetch 注入）；
        // mock 测试设 env key 让 SDK 接受构造，真实请求被 fetch 拦截
        process.env.ZHIPU_API_KEY = "test-key";
    });

    afterEach(() => {
        delete process.env.ZHIPU_API_KEY;
    });

    it("generate 返回 text content + usage（mock fetch）", async () => {
        const p = new OpenAIProvider("glm-4.5-air", {
            fetch: fakeFetch(TEXT_RESPONSE),
        });
        const result = await p.generate(
            [{ role: "user", content: "hi" }] as Message[],
            [],
        );
        expect(result.content).toBe("你好");
        expect(result.usage?.promptTokens).toBe(10);
    });

    it("generate 解析 tool_calls 为 toolCalls（arguments 为 JSON 字符串）", async () => {
        const p = new OpenAIProvider("glm-4.5-air", {
            fetch: fakeFetch(TOOL_RESPONSE),
        });
        const result = await p.generate(
            [{ role: "user", content: "ls" }] as Message[],
            [],
        );
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].name).toBe("bash");
        expect(result.toolCalls![0].arguments).toEqual({ command: "ls" });
    });

    it("缺 apiKey 且未注入 fetch 时 throw（P4）", () => {
        delete process.env.ZHIPU_API_KEY; // 本测试删 env（beforeEach 已设）
        expect(() => new OpenAIProvider("glm-4.5-air")).toThrow(/ZHIPU_API_KEY/);
    });

    it("baseURL 为新地址 .../api/coding/paas/v4（无 trailing slash）", async () => {
        let capturedUrl = "";
        const fetch = async (url: unknown) => {
            capturedUrl = String(url);
            return fakeFetch(TEXT_RESPONSE)();
        };
        const p = new OpenAIProvider("glm-4.5-air", { fetch });
        await p.generate([{ role: "user", content: "x" }] as Message[], []);
        expect(capturedUrl).toContain("/api/coding/paas/v4");
        expect(capturedUrl).not.toContain("/api/paas/v4/");
    });
});
