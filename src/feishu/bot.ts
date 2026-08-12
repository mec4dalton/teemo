// 飞书神经元层 - FeishuBot 调度器

import { AsyncLocalStorage } from "node:async_hooks";
import * as lark from "@larksuiteoapi/node-sdk";
import type { Reporter } from "../engine/reporter.js";
import type { AgentEngine } from "../engine/loop.js";
import type { Session } from "../context/session.js";
import { RoleUser } from "../schema/message.js";
import { globalSessionMgr } from "../context/session.js";
import { globalApprovalMgr } from "./approval.js";
import { FeishuReporter, type LarkMessager } from "./reporter.js";

// 承载"当前请求的专属 Reporter"，跨 await 透传，并发群聊天然隔离
export const reporterStorage = new AsyncLocalStorage<Reporter>();

// 供 Phase 4B 的 registry middleware 取当前请求的 Reporter
export function getCurrentReporter(): Reporter | null {
    return reporterStorage.getStore() ?? null;
}

// 口令解析：approve <id> / reject <id> / 普通消息
export type ParsedMessage =
    | { type: "approve"; taskID: string }
    | { type: "reject"; taskID: string }
    | { type: "agent"; content: string };

export function parseMessage(raw: string): ParsedMessage {
    const content = stripFeishuWrapper(raw);
    if (content.startsWith("approve ")) {
        return { type: "approve", taskID: content.slice(8).trim() };
    }
    if (content.startsWith("reject ")) {
        return { type: "reject", taskID: content.slice(7).trim() };
    }
    return { type: "agent", content };
}

// 飞书 content 形如 {"text":"xxx"}，剥壳取 text
function stripFeishuWrapper(raw: string): string {
    let s = raw;
    if (s.startsWith('{"text":"')) {
        s = s.slice('{"text":"'.length);
    }
    if (s.endsWith('"}')) {
        s = s.slice(0, -2);
    }
    return s;
}

// 工厂：按 Session 产出独立 Engine
export type AgentEngineFactory = (session: Session) => AgentEngine;

export class FeishuBot {
    private readonly client: LarkMessager;

    constructor(
        private readonly factory: AgentEngineFactory,
        private readonly workDir: string,
        client?: LarkMessager,
    ) {
        this.client = client ?? this.buildClient();
    }

    // 事件订阅。内部读 env（verifyToken + encryptKey）。
    buildEventDispatcher(): lark.EventDispatcher {
        const encryptKey = process.env.FEISHU_ENCRYPT_KEY ?? "";
        const verificationToken = process.env.FEISHU_VERIFY_TOKEN ?? "";
        return new lark.EventDispatcher({ encryptKey, verificationToken }).register({
            "im.message.receive_v1": async (data) => {
                const chatId = data.message.chat_id;
                const content = data.message.content;
                await this.handleEvent(chatId, content);
            },
        });
    }

    // 处理事件：口令分发 or 普通消息启动 Agent
    async handleEvent(chatId: string, content: string): Promise<void> {
        const parsed = parseMessage(content);
        if (parsed.type === "approve") {
            globalApprovalMgr.resolveApproval(parsed.taskID, true, "人类管理员已批准操作");
            return;
        }
        if (parsed.type === "reject") {
            globalApprovalMgr.resolveApproval(
                parsed.taskID,
                false,
                "人类管理员认为该操作存在极高风险，已无情拒绝",
            );
            return;
        }
        // 普通消息 async 启动 Agent（不阻塞 Webhook）
        void this.handleAgentRun(chatId, parsed.content);
    }

    // async 启动 Agent
    async handleAgentRun(chatId: string, prompt: string): Promise<void> {
        const reporter = new FeishuReporter(this.client, chatId);
        const sess = globalSessionMgr.getOrCreate(chatId, this.workDir);
        sess.append({ role: RoleUser, content: prompt });
        const eng = this.factory(sess);
        // reporter 塞入 ALS，供 registry middleware 取
        await reporterStorage.run(reporter, () => this.runEngine(eng, sess, reporter));
    }

    // 引擎执行 + 崩溃兜底（独立函数以控制行数）
    private async runEngine(
        eng: AgentEngine,
        sess: Session,
        reporter: FeishuReporter,
    ): Promise<void> {
        try {
            await eng.run(sess, reporter);
        } catch (err) {
            await reporter.sendMsg(`❌ Agent 运行崩溃: ${String(err)}`);
        }
    }

    private buildClient(): LarkMessager {
        const appId = process.env.FEISHU_APP_ID ?? "";
        const appSecret = process.env.FEISHU_APP_SECRET ?? "";
        return new lark.Client({ appId, appSecret }) as unknown as LarkMessager;
    }
}

// 测试辅助：构造注入 client 的 bot（绕过 env 校验）
export function newFeishuBotForTest(opts: {
    workDir: string;
    factory: AgentEngineFactory;
}): FeishuBot {
    const fakeClient: LarkMessager = {
        im: { message: { create: async () => undefined } },
    };
    return new FeishuBot(opts.factory, opts.workDir, fakeClient);
}
