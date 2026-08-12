// cmd 入口 - agentops 飞书服务端
// Node http；安全 middleware 接通 feishu 审批链 + engineFactory 闭包

import * as http from "node:http";
import type { LLMProvider } from "../../provider/interface.js";
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
    type AgentEngineFactory,
} from "../../feishu/bot.js";

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
    registry: Registry,
): AgentEngineFactory {
    return (session: Session): AgentEngine => {
        const tracked = new CostTracker(provider, modelName, session);
        return new AgentEngineClass(tracked, registry, false, false);
    };
}

// main（thin）：workDir + provider + registry + factory + http server
async function main(): Promise<void> {
    const workDir = process.cwd() + "/workspace";
    const fs = await import("node:fs/promises");
    await fs.mkdir(workDir, { recursive: true });
    const { OpenAIProvider } = await import("../../provider/openai.js");
    const provider = new OpenAIProvider("glm-4.5-air");
    const registry = buildAgentOpsRegistry(workDir);
    const factory = buildEngineFactory(provider, "glm-4.5-air", registry);
    await startServer(factory, workDir);
}

// Node http server + webhook 事件分发
async function startServer(
    factory: AgentEngineFactory,
    workDir: string,
): Promise<void> {
    const bot = new FeishuBot(factory, workDir);
    const server = http.createServer((req, res) => {
        void handleRequest(req, res, bot);
    });
    server.listen(48080, () => {
        console.log("📡 Webhook 服务已启动，监听端口 :48080");
    });
}

// 事件分发：/webhook/event 解析 body 后交 bot.handleEvent
function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    bot: FeishuBot,
): Promise<void> {
    if (req.url !== "/webhook/event") {
        res.end("teemo agentops");
        return Promise.resolve();
    }
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => void dispatch(body, res, bot));
    return Promise.resolve();
}

async function dispatch(
    body: string,
    res: http.ServerResponse,
    bot: FeishuBot,
): Promise<void> {
    try {
        const event = JSON.parse(body) as {
            event?: { message?: { chat_id?: string; content?: string } };
        };
        const chatId = event.event?.message?.chat_id;
        const content = event.event?.message?.content;
        if (chatId && content) {
            await bot.handleEvent(chatId, content);
        }
    } catch {
        // 忽略解析错误
    }
    res.end("ok");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
