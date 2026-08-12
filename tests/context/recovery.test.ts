import { describe, it, expect } from "vitest";
import { RecoveryManager } from "@/context/recovery.js";

describe("RecoveryManager", () => {
    const rm = new RecoveryManager();

    it("edit_file 未找到 old_text → 追加 read_file 救援指南", () => {
        const out = rm.analyzeAndInject("edit_file", "在文件中未找到 old_text，请检查");
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("read_file");
    });

    it("edit_file 多处命中 → 追加上下文指南", () => {
        const out = rm.analyzeAndInject("edit_file", "old_text 匹配到了 2 处，请提供更多上下文");
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("上下文");
    });

    it("read_file no such file → 追加 ls 指南", () => {
        const out = rm.analyzeAndInject("read_file", "Error: ENOENT: no such file or directory");
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("ls");
    });

    it("bash 超时（注意：匹配 bash.ts 的「超时(30s)」文案）→ 追加后台执行指南", () => {
        const out = rm.analyzeAndInject(
            "bash",
            "[警告: 命令执行超时(30s)，已被系统强制终止。]",
        );
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("后台");
    });

    it("bash command not found → 追加替代命令指南", () => {
        const out = rm.analyzeAndInject("bash", "bash: foo: command not found");
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("替代");
    });

    it("未命中特征原样返回", () => {
        const raw = "某个未知的报错文案";
        expect(rm.analyzeAndInject("edit_file", raw)).toBe(raw);
    });
});
