// 上下文工程层 - 会话消息历史

import type { Message } from "../schema/message.js";
import { RoleUser } from "../schema/message.js";

export class Session {
    readonly id: string;
    readonly workDir: string;
    totalPromptTokens = 0;
    totalCompletionTokens = 0;
    totalCostCNY = 0;
    private history: Message[] = [];

    constructor(id: string, workDir: string) {
        this.id = id;
        this.workDir = workDir;
    }

    append(...msgs: Message[]): void {
        this.history.push(...msgs);
    }

    getWorkingMemory(limit: number): Message[] {
        const total = this.history.length;
        if (total <= limit || limit <= 0) {
            return [...this.history];
        }
        return this.trimOrphans(this.history.slice(total - limit));
    }

    // 修剪截断边缘的 ToolResult 孤儿：首条若是 User+toolCallId 则逐条移除
    private trimOrphans(msgs: Message[]): Message[] {
        let res = msgs;
        while (res.length > 0 && res[0].role === RoleUser && res[0].toolCallId) {
            res = res.slice(1);
        }
        return res;
    }

    // 给外部 Tracker 调用，累加账单
    recordUsage(prompt: number, completion: number, cost: number): void {
        this.totalPromptTokens += prompt;
        this.totalCompletionTokens += completion;
        this.totalCostCNY += cost;
    }
}

export class SessionManager {
    private readonly sessions = new Map<string, Session>();

    getOrCreate(id: string, workDir: string): Session {
        const existing = this.sessions.get(id);
        if (existing) return existing;
        const sess = new Session(id, workDir);
        this.sessions.set(id, sess);
        return sess;
    }
}

// 模块级单例
export const globalSessionMgr = new SessionManager();
