// read_file 工具

import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { BaseTool } from "./registry.js";
import type { ToolDefinition } from "../schema/message.js";

const MAX_LEN = 8000;

export class ReadFileTool implements BaseTool {
    constructor(private readonly workDir: string) {}

    name(): string {
        return "read_file";
    }

    definition(): ToolDefinition {
        return {
            name: this.name(),
            description: "读取指定路径的文件内容。请提供相对工作区的路径。",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "要读取的文件路径" },
                },
                required: ["path"],
            },
        };
    }

    async execute(args: unknown): Promise<string> {
        const relPath = this.parseArgs(args);
        const fullPath = path.join(this.workDir, relPath);
        // 文件不存在时 fs.readFile 抛 ENOENT，原样抛出供 Recovery 匹配 no such file
        const content = await fs.readFile(fullPath, "utf-8");
        return this.truncate(content);
    }

    private parseArgs(args: unknown): string {
        const a = args as { path?: string };
        if (typeof a.path !== "string") {
            throw new Error("参数解析失败: 缺少 path");
        }
        return a.path;
    }

    // 注意：.length 按 UTF-16 码元计（非字节），中文场景阈值含义有偏移
    // 截断文案保留"字节"字样以，但语义按码元，需严格等价再引 Buffer.byteLength
    private truncate(content: string): string {
        if (content.length > MAX_LEN) {
            return (
                content.slice(0, MAX_LEN) +
                `\n\n...[由于内容过长，已被系统截断至前 ${MAX_LEN} 字节]...`
            );
        }
        return content;
    }
}
