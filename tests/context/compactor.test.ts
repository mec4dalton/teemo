import { describe, it, expect } from "vitest";
import { Compactor } from "@/context/compactor.js";
import type { Message } from "@/schema/message.js";
import {
    RoleSystem,
    RoleUser,
    RoleAssistant,
} from "@/schema/message.js";

describe("Compactor", () => {
    it("未超阈值原样返回", () => {
        const c = new Compactor(10000, 4);
        const msgs: Message[] = [
            { role: RoleUser, content: "hi" },
            { role: RoleAssistant, content: "hello" },
        ];
        expect(c.compact(msgs)).toBe(msgs);
    });

    it("超阈值时保留 RoleSystem 原文", () => {
        const c = new Compactor(5, 1);
        const sys: Message = { role: RoleSystem, content: "系统提示" };
        const longTool: Message = {
            role: RoleUser,
            content: "x".repeat(500),
            toolCallId: "tc1",
        };
        const result = c.compact([sys, longTool, { role: RoleUser, content: "近" }]);
        const sysMsg = result.find((m) => m.role === RoleSystem);
        expect(sysMsg?.content).toBe("系统提示");
    });

    it("早期工具输出（非保留区）超 200 字符被折叠为清理提示", () => {
        const c = new Compactor(5, 1); // retainLastMsgs=1，早期不保留
        const earlyTool: Message = {
            role: RoleUser,
            content: "x".repeat(500),
            toolCallId: "tc1",
        };
        const result = c.compact([earlyTool, { role: RoleUser, content: "近" }]);
        const folded = result[0];
        expect(folded.content).toContain("已被系统强制清理");
    });

    it("保留区内超长工具输出被首尾截断", () => {
        const c = new Compactor(5, 1); // retainLastMsgs=1，最后 1 条在保留区
        const recentTool: Message = {
            role: RoleUser,
            content: "y".repeat(2500),
            toolCallId: "tc1",
        };
        const result = c.compact([recentTool]);
        expect(result[0].content).toContain("已被系统截断");
        expect(result[0].content.length).toBeLessThan(2500);
    });

    it("estimateLength 累加 content 与 toolCalls", () => {
        const c = new Compactor(10000, 4);
        const msgs: Message[] = [
            { role: RoleUser, content: "abcd" },
            {
                role: RoleAssistant,
                content: "ef",
                toolCalls: [{ id: "1", name: "bash", arguments: { x: 1 } }],
            },
        ];
        // abcd(4) + ef(2) + bash(4) + JSON({x:1})=7 → 17
        expect(c.estimateLength(msgs)).toBe(17);
    });
});
