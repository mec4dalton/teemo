import { describe, it, expect } from "vitest";
import { ReminderInjector, generateFingerprint } from "@/engine/reminder.js";
import type { ToolCall, ToolResult } from "@/schema/message.js";

const call = (name: string, args: unknown): ToolCall => ({
    id: "c1",
    name,
    arguments: args,
});
const ok = (): ToolResult => ({ toolCallId: "c1", output: "ok", isError: false });
const fail = (): ToolResult => ({ toolCallId: "c1", output: "err", isError: true });

describe("generateFingerprint", () => {
    it("对 工具名+参数 生成稳定的 md5 指纹", () => {
        const a = generateFingerprint("bash", JSON.stringify({ command: "ls" }));
        const b = generateFingerprint("bash", JSON.stringify({ command: "ls" }));
        const c = generateFingerprint("bash", JSON.stringify({ command: "pwd" }));
        expect(a).toBe(b); // 相同输入相同指纹
        expect(a).not.toBe(c); // 不同参数不同指纹
    });
});

describe("ReminderInjector", () => {
    it("成功清空整个 map（注意）：清空后同一指纹重头计数", () => {
        const inj = new ReminderInjector();
        const c = call("bash", { command: "ls" });
        inj.checkAndInject(c, fail()); // 指纹 A: count→1
        inj.checkAndInject(c, fail()); // 指纹 A: count→2
        // 成功应清空整个 map（注意）
        expect(inj.checkAndInject(call("read_file", { path: "a" }), ok())).toBeNull();
        // 清空后同一指纹两次失败 → count 从 0 起算（1,2），仍 <3 不注入；
        // 若未清空，此处 count=3 会注入（非 null），测试失败
        expect(inj.checkAndInject(c, fail())).toBeNull();
        expect(inj.checkAndInject(c, fail())).toBeNull();
    });

    it("连续失败 <3 次返回 null", () => {
        const inj = new ReminderInjector();
        const c = call("bash", { command: "ls" });
        expect(inj.checkAndInject(c, fail())).toBeNull();
        expect(inj.checkAndInject(c, fail())).toBeNull();
    });

    it("同一指纹连续失败 ≥3 次注入 SYSTEM REMINDER 强指令", () => {
        const inj = new ReminderInjector();
        const c = call("bash", { command: "ls" });
        inj.checkAndInject(c, fail());
        inj.checkAndInject(c, fail());
        const msg = inj.checkAndInject(c, fail()); // 第 3 次
        expect(msg).not.toBeNull();
        expect(msg!.role).toBe("user");
        expect(msg!.content).toContain("SYSTEM REMINDER");
        expect(msg!.content).toContain("死循环");
        expect(msg!.content).toContain("bash");
    });

    it("不同参数的工具失败不累加（指纹不同）", () => {
        const inj = new ReminderInjector();
        inj.checkAndInject(call("bash", { command: "ls" }), fail());
        inj.checkAndInject(call("bash", { command: "pwd" }), fail());
        // 两个不同指纹各 1 次，都不应触发
        expect(inj.checkAndInject(call("bash", { command: "ls" }), fail())).toBeNull();
    });
});
