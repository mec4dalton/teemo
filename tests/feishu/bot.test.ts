import { describe, it, expect, vi } from "vitest";
import {
    parseMessage,
    getCurrentReporter,
    reporterStorage,
    FeishuBot,
    newFeishuBotForTest,
    type AgentEngineFactory,
} from "@/feishu/bot.js";
import type { Session } from "@/context/session.js";
import type { AgentEngine } from "@/engine/loop.js";
import { globalApprovalMgr } from "@/feishu/approval.js";

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

describe("FeishuBot 凭据 fail fast", () => {
    it("缺 FEISHU_APP_ID / FEISHU_APP_SECRET 时 new 抛错并指明变量", () => {
        const savedId = process.env.FEISHU_APP_ID;
        const savedSecret = process.env.FEISHU_APP_SECRET;
        delete process.env.FEISHU_APP_ID;
        delete process.env.FEISHU_APP_SECRET;
        try {
            expect(
                () =>
                    new FeishuBot(
                        undefined as never,
                        "/tmp/test-workspace",
                        { im: { message: { create: async () => undefined } } } as never,
                    ),
            ).toThrow(/FEISHU_APP_ID/);
        } finally {
            if (savedId !== undefined) process.env.FEISHU_APP_ID = savedId;
            if (savedSecret !== undefined) process.env.FEISHU_APP_SECRET = savedSecret;
        }
    });

    it("凭据齐全时 credentials 暴露 appId/appSecret（供 WSClient 使用）", () => {
        process.env.FEISHU_APP_ID = "app-1";
        process.env.FEISHU_APP_SECRET = "secret-1";
        try {
            const bot = new FeishuBot(
                undefined as never,
                "/tmp/test-workspace",
                { im: { message: { create: async () => undefined } } } as never,
            );
            expect(bot.credentials).toEqual({ appId: "app-1", appSecret: "secret-1" });
        } finally {
            delete process.env.FEISHU_APP_ID;
            delete process.env.FEISHU_APP_SECRET;
        }
    });
});

describe("buildEventDispatcher（长连接事件转发）", () => {
    it("注册 im.message.receive_v1 并转发到 handleEvent(chatId, content)", async () => {
        const runSpy = vi.fn().mockResolvedValue(undefined);
        const engine = { run: runSpy } as unknown as AgentEngine;
        const bot = newFeishuBotForTest({
            workDir: "/tmp/test-workspace",
            factory: (_s: Session) => engine,
        });
        const dispatcher = bot.buildEventDispatcher();
        const handler = dispatcher.handles.get("im.message.receive_v1");
        expect(handler).toBeDefined();
        await handler!({
            message: { chat_id: "chat-9", content: '{"text":"帮我查日志"}' },
        });
        // handleEvent 普通消息分支 → handleAgentRun → engine.run
        await vi.waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    });

    it("approve 口令经 dispatcher 转发唤醒审批", async () => {
        const bot = newFeishuBotForTest({
            workDir: "/tmp/test-workspace",
            factory: (_s: Session) => ({}) as AgentEngine,
        });
        const pending = globalApprovalMgr.waitForApproval(
            "disp-1", "bash", "rm", vi.fn(),
        );
        const dispatcher = bot.buildEventDispatcher();
        const handler = dispatcher.handles.get("im.message.receive_v1")!;
        await handler({
            message: { chat_id: "chat-9", content: "approve disp-1" },
        });
        const result = await pending;
        expect(result.allowed).toBe(true);
    });
});
