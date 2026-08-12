import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { PromptComposer } from "@/context/composer.js";
import { RoleSystem } from "@/schema/message.js";

describe("PromptComposer", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-composer-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("Build 返回 RoleSystem 消息，含核心身份与 Teemo 命名（N1）", async () => {
        const c = new PromptComposer(workDir, false);
        const msg = await c.build();
        expect(msg.role).toBe(RoleSystem);
        expect(msg.content).toContain("核心身份");
        expect(msg.content).toContain("Teemo");
        expect(msg.content).not.toContain("go-tiny-claw");
    });

    it("PlanMode=false 不含 Plan Mode 段", async () => {
        const c = new PromptComposer(workDir, false);
        const msg = await c.build();
        expect(msg.content).not.toContain("Plan Mode: ON");
    });

    it("PlanMode=true 含 Plan Mode 段（PLAN.md/TODO.md 强制工作流）", async () => {
        const c = new PromptComposer(workDir, true);
        const msg = await c.build();
        expect(msg.content).toContain("Plan Mode: ON");
        expect(msg.content).toContain("PLAN.md");
        expect(msg.content).toContain("TODO.md");
    });

    it("工作区有 AGENTS.md 时内嵌为项目专属指南", async () => {
        await fs.writeFile(path.join(workDir, "AGENTS.md"), "红线：禁止 rm -rf /", "utf-8");
        const c = new PromptComposer(workDir, false);
        const msg = await c.build();
        expect(msg.content).toContain("项目专属指南");
        expect(msg.content).toContain("红线：禁止 rm -rf /");
    });

    it("工作区无 AGENTS.md 时不报错、不含项目专属指南段", async () => {
        const c = new PromptComposer(workDir, false);
        const msg = await c.build();
        expect(msg.content).not.toContain("项目专属指南");
    });

    it(".teemo/skills 有 SKILL.md 时拼入技能段", async () => {
        const skillDir = path.join(workDir, ".teemo", "skills", "ops");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
            path.join(skillDir, "SKILL.md"),
            "---\nname: ops\ndescription: 运维\n---\n步骤",
            "utf-8",
        );
        const c = new PromptComposer(workDir, false);
        const msg = await c.build();
        expect(msg.content).toContain("可用专业技能");
        expect(msg.content).toContain("运维");
    });
});
