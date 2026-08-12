import { describe, it, expect, vi } from "vitest";
import {
    ApprovalManager,
    isDangerousCommand,
} from "@/feishu/approval.js";

describe("isDangerousCommand", () => {
    it("read_file 白名单放行", () => {
        expect(isDangerousCommand("read_file", '{"path":"a"}')).toBe(false);
    });

    it("write_file / edit_file 一律高危", () => {
        expect(isDangerousCommand("write_file", '{"path":"a"}')).toBe(true);
        expect(isDangerousCommand("edit_file", '{"path":"a"}')).toBe(true);
    });

    it("bash 命中黑名单正则高危（rm -r / sudo / systemctl / kill / nginx -s 等）", () => {
        expect(isDangerousCommand("bash", '{"command":"rm -rf /"}')).toBe(true);
        expect(isDangerousCommand("bash", '{"command":"sudo apt install"}')).toBe(true);
        expect(isDangerousCommand("bash", '{"command":"systemctl restart nginx"}')).toBe(true);
        expect(isDangerousCommand("bash", '{"command":"kill -9 1234"}')).toBe(true);
        expect(isDangerousCommand("bash", '{"command":"nginx -s reload"}')).toBe(true);
    });

    it("bash 未命中黑名单放行（ls / tail 等）", () => {
        expect(isDangerousCommand("bash", '{"command":"ls -la"}')).toBe(false);
        expect(isDangerousCommand("bash", '{"command":"tail -n 50 log"}')).toBe(false);
    });
});

describe("ApprovalManager（注意：Promise+resolver）", () => {
    it("waitForApproval 挂起直到 resolveApproval 唤醒（approve）", async () => {
        const mgr = new ApprovalManager();
        const sendMsg = vi.fn();
        // 不 await，先拿到 pending promise
        const pending = mgr.waitForApproval("t1", "bash", "rm -rf", sendMsg);
        // 发送了审批请求
        expect(sendMsg).toHaveBeenCalledTimes(1);
        // 唤醒（approve）
        mgr.resolveApproval("t1", true, "已批准");
        const result = await pending;
        expect(result).toEqual({ allowed: true, reason: "已批准" });
    });

    it("resolveApproval reject 时返回 allowed=false", async () => {
        const mgr = new ApprovalManager();
        const pending = mgr.waitForApproval("t2", "write_file", "{}", vi.fn());
        mgr.resolveApproval("t2", false, "风险太高");
        const result = await pending;
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("风险太高");
    });

    it("sendMsg 缺省时走 console（不抛错）", async () => {
        const mgr = new ApprovalManager();
        const pending = mgr.waitForApproval("t3", "bash", "rm", undefined);
        mgr.resolveApproval("t3", true, "");
        await expect(pending).resolves.toEqual({ allowed: true, reason: "" });
    });

    it("resolveApproval 未知 taskID 静默（不抛错）", () => {
        const mgr = new ApprovalManager();
        expect(() => mgr.resolveApproval("unknown", true, "")).not.toThrow();
    });
});
