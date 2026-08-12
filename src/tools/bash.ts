// bash 工具

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { BaseTool } from "./registry.js";
import type { ToolDefinition } from "../schema/message.js";

const execAsync = promisify(exec);
const TIMEOUT_MS = 30000;
const MAX_LEN = 8000;

export class BashTool implements BaseTool {
    constructor(private readonly workDir: string) {}

    name(): string {
        return "bash";
    }

    definition(): ToolDefinition {
        const desc =
            "在当前工作区执行任意的 bash 命令。" +
            "支持链式命令。返回 stdout 和 stderr。";
        return {
            name: this.name(),
            description: desc,
            inputSchema: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "要执行的 bash 命令",
                    },
                },
                required: ["command"],
            },
        };
    }

    async execute(args: unknown): Promise<string> {
        const command = this.parseArgs(args);
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workDir,
                timeout: TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
            });
            return this.formatOutput(stdout + stderr);
        } catch (err) {
            return this.handleError(err);
        }
    }

    private parseArgs(args: unknown): string {
        const a = args as { command?: string };
        if (typeof a.command !== "string") {
            throw new Error("参数解析失败: 缺少 command");
        }
        return a.command;
    }

    private handleError(err: unknown): string {
        const e = err as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            killed?: boolean;
            signal?: string;
        };
        const combined = (e.stdout ?? "") + (e.stderr ?? "");
        // 注意：超时文案需与 recovery.ts 联动匹配，固定串「超时(30s)」
        if (e.killed || e.signal === "SIGTERM") {
            return combined + "\n[警告: 命令执行超时(30s)，已被系统强制终止。]";
        }
        return `执行报错: ${e.message}\n输出:\n${combined}`;
    }

    // 注意：.length 为码元（此处语义一致即可）
    private formatOutput(s: string): string {
        if (s === "") return "命令执行成功，无终端输出。";
        if (s.length > MAX_LEN) {
            return (
                s.slice(0, MAX_LEN) +
                `\n\n...[终端输出过长，已截断至前 ${MAX_LEN} 字节]...`
            );
        }
        return s;
    }
}
