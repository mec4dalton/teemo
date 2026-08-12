// 上下文工程层 - 技能外挂加载

import * as path from "node:path";
import { promises as fs } from "node:fs";

export interface Skill {
    name: string;
    description: string;
    body: string;
}

export class SkillLoader {
    constructor(private readonly workDir: string) {}

    async loadAll(): Promise<string> {
        const baseDir = path.join(this.workDir, ".teemo", "skills");
        try {
            await fs.stat(baseDir);
        } catch {
            return "";
        }
        const skills = await this.findSkills(baseDir);
        if (skills.length === 0) return "";
        return this.buildSection(skills);
    }

    private async findSkills(dir: string): Promise<Skill[]> {
        const result: Skill[] = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                result.push(...(await this.findSkills(full)));
            } else if (entry.name === "SKILL.md") {
                const content = await fs.readFile(full, "utf-8");
                result.push(parseSkillMD(content));
            }
        }
        return result;
    }

    private buildSection(skills: Skill[]): string {
        let builder = "\n### 可用专业技能 (Agent Skills)\n";
        builder += "以下是你拥有的标准化外挂技能，请在符合 description 描述的场景下";
        builder += "严格遵循其正文指令：\n\n";
        for (const skill of skills) {
            builder += `#### 技能名称: ${skill.name}\n`;
            builder += `**触发条件**: ${skill.description}\n\n`;
            builder += "**执行指南**:\n";
            builder += skill.body;
            builder += "\n\n---\n";
        }
        return builder;
    }
}

export function parseSkillMD(content: string): Skill {
    const skill: Skill = {
        name: "Unknown Skill",
        description: "No description provided.",
        body: content,
    };
    const frontmatter = extractFrontmatter(content);
    if (!frontmatter) return skill;
    skill.body = frontmatter.body;
    applyFields(skill, frontmatter.meta);
    return skill;
}

interface Frontmatter {
    body: string;
    meta: string;
}

// frontmatter 手写解析（--- 分隔，找首尾标记）
function extractFrontmatter(content: string): Frontmatter | null {
    const opener = content.startsWith("---\n")
        ? "---\n"
        : content.startsWith("---\r\n")
            ? "---\r\n"
            : null;
    if (!opener) return null;
    const after = content.slice(opener.length);
    const closeIdx = after.indexOf("---");
    if (closeIdx === -1) return null;
    return {
        meta: after.slice(0, closeIdx),
        body: after.slice(closeIdx + 3).trim(),
    };
}

function applyFields(skill: Skill, meta: string): void {
    for (const line of meta.split("\n")) {
        const t = line.trim();
        if (t.startsWith("name:")) {
            skill.name = t.slice("name:".length).trim();
        } else if (t.startsWith("description:")) {
            skill.description = t.slice("description:".length).trim();
        }
    }
}
