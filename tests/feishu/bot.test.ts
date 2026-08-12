import { describe, it, expect, vi } from "vitest";
import {
    parseMessage,
    getCurrentReporter,
    reporterStorage,
    type FeishuBot,
} from "@/feishu/bot.js";
import type { Session } from "@/context/session.js";
import type { AgentEngine } from "@/engine/loop.js";

describe("parseMessage（口令解析）", () => {
    it("approve 口令解析出 taskID", () => {
        expect(parseMessage("approve t123")).toEqual({
            type: "approve",
            taskID: "t123",
        });
        expect(parseMessage("approve  t456 ")).toEqual({
            type: "approve",
            taskID: "t456",
        });
    });

    it("reject 口令解析出 taskID", () => {
        expect(parseMessage("reject t789")).toEqual({
            type: "reject",
            taskID: "t789",
        });
    });

    it("普通消息解析为 agent", () => {
        expect(parseMessage("帮我查日志")).toEqual({
            type: "agent",
            content: "帮我查日志",
        });
    });

    it("飞书 content JSON 剥壳（{\"text\":\"xxx\"} → xxx）", () => {
        expect(parseMessage('{"text":"approve t1"}')).toEqual({
            type: "approve",
            taskID: "t1",
        });
    });
});

describe("reporterStorage（ALS reporter 透传，D3）", () => {
    it("run 内 getCurrentReporter 取到注入的 reporter", () => {
        const fakeReporter = {
            onThinking: vi.fn(),
            onToolCall: vi.fn(),
            onToolResult: vi.fn(),
            onMessage: vi.fn(),
        };
        reporterStorage.run(fakeReporter, () => {
            expect(getCurrentReporter()).toBe(fakeReporter);
        });
    });

    it("run 外 getCurrentReporter 返回 null", () => {
        expect(getCurrentReporter()).toBeNull();
    });
});

describe("FeishuBot.handleAgentRun", () => {
    it("为会话创建专属 reporter + session + factory engine + ALS 透传 + run", async () => {
        const { newFeishuBotForTest } = await import("@/feishu/bot.js");
        const runSpy = vi.fn(async (_session: unknown, _reporter: unknown) => {
            // ALS 透传——engine.run 体内 getCurrentReporter 应取到 reporter
            expect(getCurrentReporter()).not.toBeNull();
        });
        const engine = { run: runSpy } as unknown as AgentEngine;
        const bot = newFeishuBotForTest({
            workDir: "/tmp/test-workspace",
            factory: (_sess: Session) => engine,
        });
        await bot.handleAgentRun("chat-1", "帮我查日志");
        expect(runSpy).toHaveBeenCalledTimes(1);
        // run 的第一参是 session（id=chatId），第二参是 reporter（FeishuReporter）
        const session = runSpy.mock.calls[0][0] as Session;
        const reporter = runSpy.mock.calls[0][1];
        expect(session.id).toBe("chat-1");
        expect(reporter).toBeDefined();
    });
});
