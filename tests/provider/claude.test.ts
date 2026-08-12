import { describe, it, expect } from "vitest";
import { ClaudeProvider } from "@/provider/claude.js";
import type { Message } from "@/schema/message.js";

// mock fetch 返回预设 Anthropic Messages 响应 JSON
function fakeFetch(responseBody: unknown) {
    return async () =>
        new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
}

const TEXT_RESPONSE = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "你好" }],
    model: "glm-4.5-air",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
};

const TOOL_USE_RESPONSE = {
    id: "msg_2",
    type: "message",
    role: "assistant",
    content: [
        { type: "tool_use", id: "tu_1", name: "bash", input: { command: "ls" } },
    ],
    model: "glm-4.5-air",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 3 },
};

describe("ClaudeProvider", () => {
    it("generate 返回 text content + usage（mock fetch）", async () => {
        const p = new ClaudeProvider("glm-4.5-air", {
            fetch: fakeFetch(TEXT_RESPONSE),
        });
        const result = await p.generate(
            [{ role: "user", content: "hi" }] as Message[],
            [],
        );
        expect(result.role).toBe("assistant");
        expect(result.content).toBe("你好");
        expect(result.usage?.promptTokens).toBe(10);
        expect(result.usage?.completionTokens).toBe(5);
    });

    it("generate 解析 tool_use block 为 toolCalls", async () => {
        const p = new ClaudeProvider("glm-4.5-air", {
            fetch: fakeFetch(TOOL_USE_RESPONSE),
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
        delete process.env.ZHIPU_API_KEY;
        expect(() => new ClaudeProvider("glm-4.5-air")).toThrow(/ZHIPU_API_KEY/);
    });

    it("1214：空 content 的 assistant 消息仍下发请求（不抛错，注意待实测）", async () => {
        // 捕获请求 body，验证含空 text block（不因空 content 跳过）
        let capturedBody: unknown = null;
        const fetch = async (_url: unknown, init?: RequestInit) => {
            capturedBody = JSON.parse(init!.body as string);
            return fakeFetch(TEXT_RESPONSE)();
        };
        const p = new ClaudeProvider("glm-4.5-air", { fetch });
        await p.generate(
            [
                { role: "user", content: "q" },
                { role: "assistant", content: "" },
                { role: "user", content: "again" },
            ] as Message[],
            [],
        );
        const msgs = (capturedBody as { messages: unknown[] }).messages;
        expect(msgs.length).toBe(3);
    });
});
