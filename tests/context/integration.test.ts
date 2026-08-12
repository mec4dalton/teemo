import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { globalSessionMgr } from "@/context/session.js";
import { Compactor } from "@/context/compactor.js";
import { RecoveryManager } from "@/context/recovery.js";
import { RoleUser, RoleAssistant } from "@/schema/message.js";

describe("context 层集成", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-ctx-int-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("Session 历史灌入后经 Compactor 压缩，早期工具输出折叠、保留区完整", () => {
        // session → compactor 真集成（消息流）：灌历史 → 取出 → 压缩。
        // 注：Composer.build() 不接收消息历史（只组装 system prompt）。
        // 故 Composer 不在此消息流中；其与 SkillLoader 的集成在 composer.test.ts 已覆盖。
        const sess = globalSessionMgr.getOrCreate("int-test", workDir);
        sess.append({
            role: RoleUser,
            content: "tool输出".repeat(200),
            toolCallId: "tc1",
        });
        sess.append({ role: RoleAssistant, content: "早期回复".repeat(100) });
        sess.append({ role: RoleUser, content: "最新指令" });

        const mem = sess.getWorkingMemory(10);
        const compactor = new Compactor(5, 1);
        const compacted = compactor.compact(mem);

        // 压缩触发：早期工具输出（非保留区）被折叠为清理提示
        expect(compacted).toHaveLength(3);
        const folded = compacted.find((m) => m.toolCallId === "tc1");
        expect(folded?.content).toContain("已被系统强制清理");
        // 保留区最新指令保持完整
        expect(compacted.some((m) => m.content === "最新指令")).toBe(true);
    });

    it("RecoveryManager 对 edit_file 报错注入指南，与 edit_file.ts 固定文案对齐", () => {
        const rm = new RecoveryManager();
        const out = rm.analyzeAndInject(
            "edit_file",
            "Error executing edit_file: 在文件中未找到 old_text，请检查内容和缩进",
        );
        expect(out).toContain("[系统救援指南]");
        expect(out).toContain("read_file");
    });
});
