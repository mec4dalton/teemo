import { describe, it, expect, vi } from "vitest";
import { FeishuReporter } from "@/feishu/reporter.js";
import type { Reporter } from "@/engine/reporter.js";

// mock client：记录 im.message.create 调用
function mockClient() {
    const calls: { receiveId: string; content: string }[] = [];
    return {
        calls,
        client: {
            im: {
                message: {
                    create: async (req: {
                        data: { receive_id: string; content: string };
                    }) => {
                        calls.push({
                            receiveId: req.data.receive_id,
                            content: req.data.content,
                        });
                    },
                },
            },
        },
    };
}

describe("FeishuReporter", () => {
    it("implements Reporter（四个回调方法）", () => {
        const { client } = mockClient();
        const r: Reporter = new FeishuReporter(client as never, "chat-1");
        expect(typeof r.onThinking).toBe("function");
        expect(typeof r.onToolCall).toBe("function");
        expect(typeof r.onToolResult).toBe("function");
        expect(typeof r.onMessage).toBe("function");
    });

    it("onThinking 发飞书消息", async () => {
        const { client, calls } = mockClient();
        const r = new FeishuReporter(client as never, "chat-1");
        r.onThinking();
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0].receiveId).toBe("chat-1");
        expect(calls[0].content).toContain("思考");
    });

    it("onToolCall 发工具名+参数", async () => {
        const { client, calls } = mockClient();
        const r = new FeishuReporter(client as never, "chat-1");
        r.onToolCall("bash", '{"command":"ls"}');
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0].content).toContain("bash");
        expect(calls[0].content).toContain("ls");
    });

    it("onToolResult isError 分支", async () => {
        const { client, calls } = mockClient();
        const r = new FeishuReporter(client as never, "chat-1");
        r.onToolResult("bash", "失败信息", true);
        r.onToolResult("read_file", "", false);
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[0].content).toContain("报错");
        expect(calls[1].content).toContain("成功");
    });

    it("sendMsg（公开方法）发文本消息", async () => {
        const { client, calls } = mockClient();
        const r = new FeishuReporter(client as never, "chat-1");
        await r.sendMsg("自定义消息");
        expect(calls).toHaveLength(1);
        const parsed = JSON.parse(calls[0].content);
        expect(parsed.text).toBe("自定义消息");
    });
});
