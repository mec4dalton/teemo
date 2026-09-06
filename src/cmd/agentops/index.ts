// cmd 入口 - agentops 飞书服务端
// WSClient 长连接；安全 middleware 接通 feishu 审批链 + engineFactory 闭包

import * as lark from "@larksuiteoapi/node-sdk";
import type { LLMProvider } from "../../provider/interface.js";
import type { Price } from "../../config/schema.js";
import type { Session } from "../../context/session.js";
import type { AgentEngine } from "../../engine/loop.js";
import type { ToolCall } from "../../schema/message.js";
import type { Registry } from "../../tools/registry.js";
import { CostTracker } from "../../observability/tracker.js";
import { AgentEngine as AgentEngineClass } from "../../engine/loop.js";
import { newRegistry } from "../../tools/registry.js";
import { ReadFileTool } from "../../tools/read_file.js";
import { WriteFileTool } from "../../tools/write_file.js";
import { EditFileTool } from "../../tools/edit_file.js";
import { BashTool } from "../../tools/bash.js";
import { isDangerousCommand, globalApprovalMgr } from "../../feishu/approval.js";
import {
    FeishuBot,
    getCurrentReporter,
    readCredentialsFromEnv,
    type AgentEngineFactory,
    type FeishuCredentials,
} from "../../feishu/bot.js";
import type { TeemoConfig } from "../../config/schema.js";

// 构建 registry：4 工具 + 安全 middleware（接通 feishu 审批链）
export function buildAgentOpsRegistry(workDir: string): Registry {
    const registry = newRegistry();
    registry.register(new ReadFileTool(workDir));
    registry.register(new WriteFileTool(workDir));
    registry.register(new EditFileTool(workDir));
    registry.register(new BashTool(workDir));
    registry.use(async (call) => securityMiddleware(call));
    return registry;
}

// 安全 middleware：白名单放行；高危则挂起等审批，reason 回喂模型
async function securityMiddleware(
    call: ToolCall,
): Promise<{ allowed: boolean; rejectReason: string }> {
    const args = JSON.stringify(call.arguments);
    if (!isDangerousCommand(call.name, args)) {
        return { allowed: true, rejectReason: "" };
    }
    const sendMsg = pickSendMsg(getCurrentReporter());
    const { allowed, reason } = await globalApprovalMgr.waitForApproval(
        call.id,
        call.name,
        args,
        sendMsg,
    );
    return { allowed, rejectReason: allowed ? "" : reason };
}

// 从 reporter 提取 sendMsg（若不存在返回 undefined，走 stderr 兜底）
function pickSendMsg(
    reporter: unknown,
): ((t: string) => Promise<void>) | undefined {
    if (reporter && typeof reporter === "object" && "sendMsg" in reporter) {
        return (reporter as { sendMsg: (t: string) => Promise<void> }).sendMsg;
    }
    return undefined;
}

// 工厂：按 session 产出 engine（CostTracker 绑 session 账本）
export function buildEngineFactory(
    provider: LLMProvider,
    modelName: string,
    pricing: Record<string, Price>,
    registry: Registry,
): AgentEngineFactory {
    return (session: Session): AgentEngine => {
        const tracked = new CostTracker(provider, modelName, pricing, session);
        return new AgentEngineClass(tracked, registry, false, false);
    };
}

// 飞书凭据解析：config.json feishu 节优先，缺失回落环境变量
export function resolveFeishuCredentials(cfg: TeemoConfig): FeishuCredentials {
    return cfg.feishu ?? readCredentialsFromEnv();
}

// main（thin）：workDir + loadConfig + provider + registry + factory + 长连接
async function main(): Promise<void> {
    const workDir = process.cwd() + "/feishu-workspace";
    const fs = await import("node:fs/promises");
    await fs.mkdir(workDir, { recursive: true });
    const { loadConfig } = await import("../../config/loader.js");
    const { createProvider } = await import("../../provider/factory.js");
    const cfg = await loadConfig({ workDir });
    const provider = createProvider(cfg);
    const registry = buildAgentOpsRegistry(workDir);
    const factory = buildEngineFactory(provider, cfg.model, cfg.pricing, registry);
    const bot = new FeishuBot(
        factory,
        workDir,
        undefined,
        resolveFeishuCredentials(cfg),
    );
    await startLongConnection(bot);
}

// WSClient 长连接：SDK 负责建连鉴权、心跳、自动重连、事件分片合并
async function startLongConnection(bot: FeishuBot): Promise<void> {
    const wsClient = new lark.WSClient({
        appId: bot.credentials.appId,
        appSecret: bot.credentials.appSecret,
        onReady: () => console.log("🔌 飞书长连接已建立"),
        onReconnecting: () => console.log("🔄 长连接断开，正在重连..."),
        onReconnected: () => console.log("✅ 长连接已恢复"),
        onError: (err) => console.error(`❌ 长连接失败: ${String(err)}`),
    });
    await wsClient.start({ eventDispatcher: bot.buildEventDispatcher() });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
