import { describe, it, expect, vi } from "vitest";
import { newFeishuBotForTest } from "@/feishu/bot.js";
import { globalApprovalMgr } from "@/feishu/approval.js";
import type { Session } from "@/context/session.js";
import type { AgentEngine } from "@/engine/loop.js";

describe("feishu 集成：口令 → 审批唤醒", () => {
    it("handleEvent approve 口令唤醒挂起的 waitForApproval", async () => {
        const bot = newFeishuBotForTest({
            workDir: "/tmp/test-workspace",
            factory: (_s: Session) => ({} as AgentEngine),
        });
        // 先挂起一个审批
        const pending = globalApprovalMgr.waitForApproval(
            "int-1",
            "bash",
            "rm",
            vi.fn(),
        );
        // 模拟飞书 approve 口令事件
        await bot.handleEvent("chat-1", "approve int-1");
        const result = await pending;
        expect(result.allowed).toBe(true);
    });

    it("handleEvent 普通消息启动 Agent（factory + run）", async () => {
        const runSpy = vi.fn().mockResolvedValue(undefined);
        const engine = { run: runSpy } as unknown as AgentEngine;
        const bot = newFeishuBotForTest({
            workDir: "/tmp/test-workspace",
            factory: (_s: Session) => engine,
        });
        await bot.handleEvent("chat-2", "帮我查日志");
        // agent 分支 async 启动，等 run 被调
        await vi.waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    });
});
