// write_file 工具

import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { BaseTool } from "./registry.js";
import type { ToolDefinition } from "../schema/message.js";

export class WriteFileTool implements BaseTool {
    constructor(private readonly workDir: string) {}

    name(): string {
        return "write_file";
    }

    definition(): ToolDefinition {
        return {
            name: this.name(),
            description:
                "创建或覆盖写入一个文件。如果目录不存在会自动创建。" +
                "请提供相对工作区的路径。",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "要写入的文件路径" },
                    content: { type: "string", description: "要写入的完整文件内容" },
                },
                required: ["path", "content"],
            },
        };
    }

    async execute(args: unknown): Promise<string> {
        const { relPath, content } = this.parseArgs(args);
        const fullPath = path.join(this.workDir, relPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return `成功将内容写入到文件: ${relPath}`;
    }

    private parseArgs(args: unknown): { relPath: string; content: string } {
        const a = args as { path?: string; content?: string };
        if (typeof a.path !== "string") {
            throw new Error("参数解析失败: 缺少 path");
        }
        if (typeof a.content !== "string") {
            throw new Error("参数解析失败: 缺少 content");
        }
        return { relPath: a.path, content: a.content };
    }
}
