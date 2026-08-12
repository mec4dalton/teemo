import { describe, it, expect } from "vitest";
import {
    Session,
    SessionManager,
    globalSessionMgr,
} from "@/context/session.js";
import type { Message } from "@/schema/message.js";
import { RoleUser, RoleAssistant } from "@/schema/message.js";

describe("Session", () => {
    it("Append 累积消息，GetWorkingMemory 全量返回（limit 足够大）", () => {
        const s = new Session("s1", "/tmp");
        s.append({ role: RoleUser, content: "a" });
        s.append({ role: RoleAssistant, content: "b" });
        const mem = s.getWorkingMemory(10);
        expect(mem).toHaveLength(2);
        expect(mem[0].content).toBe("a");
        expect(mem[1].content).toBe("b");
    });

    it("GetWorkingMemory 截断到最近 N 条", () => {
        const s = new Session("s1", "/tmp");
        s.append({ role: RoleUser, content: "a" });
        s.append({ role: RoleAssistant, content: "b" });
        s.append({ role: RoleUser, content: "c" });
        const mem = s.getWorkingMemory(2);
        expect(mem).toHaveLength(2);
        expect(mem[0].content).toBe("b");
        expect(mem[1].content).toBe("c");
    });

    it("GetWorkingMemory 修剪截断边缘的 ToolResult 孤儿", () => {
        // history: [early, orphan(toolResult), assistant]
        // limit=2 截断后取最后 2 条 = [orphan, assistant]，首条 orphan 是孤儿
        // （user+toolCallId）应被修剪，只剩 [assistant]
        const s = new Session("s1", "/tmp");
        s.append({ role: RoleUser, content: "early" }); // 更早，截断后排除
        const orphan: Message = {
            role: RoleUser,
            content: "tool输出",
            toolCallId: "tc-1",
        };
        s.append(orphan); // 截断后成为首条（孤儿）
        s.append({ role: RoleAssistant, content: "reply" });
        const mem = s.getWorkingMemory(2);
        // 截断 [orphan, reply] → 首条孤儿被修剪 → [reply]
        expect(mem).toHaveLength(1);
        expect(mem[0].content).toBe("reply");
    });

    it("RecordUsage 累加 token 与花费", () => {
        const s = new Session("s1", "/tmp");
        s.recordUsage(100, 50, 0.5);
        s.recordUsage(200, 80, 1.5);
        expect(s.totalPromptTokens).toBe(300);
        expect(s.totalCompletionTokens).toBe(130);
        expect(s.totalCostCNY).toBeCloseTo(2.0, 5);
    });

    it("SessionManager.GetOrCreate 同 id 复用实例", () => {
        const mgr = new SessionManager();
        const a = mgr.getOrCreate("dup", "/tmp");
        const b = mgr.getOrCreate("dup", "/tmp");
        expect(a).toBe(b);
        const c = mgr.getOrCreate("other", "/tmp");
        expect(c).not.toBe(a);
    });

    it("globalSessionMgr 是模块级单例", () => {
        const m1 = globalSessionMgr.getOrCreate("g", "/tmp");
        const m2 = globalSessionMgr.getOrCreate("g", "/tmp");
        expect(m1).toBe(m2);
    });
});
