// 引擎层 - 终端轨迹实现

import type { Reporter } from "./reporter.js";

export class TerminalReporter implements Reporter {
    onThinking(): void {
        process.stdout.write("\n[🤔 思考中] 模型正在推理...\n");
    }

    onToolCall(toolName: string, args: string): void {
        const display = this.truncate(args.replace(/\n/g, "\\n").replace(/\r/g, "\\r"), 150);
        process.stdout.write(`[🛠️ 调用工具] ${toolName}\n   参数: ${display}\n`);
    }

    onToolResult(toolName: string, result: string, isError: boolean): void {
        if (isError) {
            const err = result === "" ? "" : `\n   错误: ${result}`;
            process.stdout.write(`[❌ 执行失败] ${toolName}${err}\n`);
        } else {
            process.stdout.write(`[✅ 执行成功] ${toolName}\n`);
        }
    }

    onMessage(content: string): void {
        if (content === "") return;
        process.stdout.write(`\n🤖 Agent 回复:\n${content}\n\n`);
    }

    private truncate(s: string, max: number): string {
        return s.length > max ? s.slice(0, max) + "... (已截断)" : s;
    }
}
