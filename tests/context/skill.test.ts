import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { SkillLoader, parseSkillMD } from "@/context/skill.js";

describe("parseSkillMD", () => {
    it("解析 frontmatter 的 name/description 与正文", () => {
        const md = `---
name: ops_troubleshoot
description: 运维排障技能
---
这是正文指令。`;
        const skill = parseSkillMD(md);
        expect(skill.name).toBe("ops_troubleshoot");
        expect(skill.description).toBe("运维排障技能");
        expect(skill.body).toBe("这是正文指令。");
    });

    it("无 frontmatter 时用默认值，正文为全文", () => {
        const skill = parseSkillMD("无 frontmarkder 的正文");
        expect(skill.name).toBe("Unknown Skill");
        expect(skill.body).toBe("无 frontmarkder 的正文");
    });
});

describe("SkillLoader", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-skill-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("无 .teemo/skills 目录时返回空串", async () => {
        const loader = new SkillLoader(workDir);
        expect(await loader.loadAll()).toBe("");
    });

    it("扫描 SKILL.md 并拼成技能段", async () => {
        const skillDir = path.join(workDir, ".teemo", "skills", "ops");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
            path.join(skillDir, "SKILL.md"),
            `---
name: ops_troubleshoot
description: 运维排障
---
执行排障步骤。`,
            "utf-8",
        );
        const loader = new SkillLoader(workDir);
        const result = await loader.loadAll();
        expect(result).toContain("ops_troubleshoot");
        expect(result).toContain("运维排障");
        expect(result).toContain("执行排障步骤");
        expect(result).toContain("可用专业技能");
    });
});
