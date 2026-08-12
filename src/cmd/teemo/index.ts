// cmd 入口 - teemo CLI

import type { LLMProvider } from "../../provider/interface.js";
import type { Session } from "../../context/session.js";
import { RoleUser } from "../../schema/message.js";
import { CostTracker } from "../../observability/tracker.js";
import { AgentEngine } from "../../engine/loop.js";
import { TerminalReporter } from "../../engine/terminal_reporter.js";
import { newRegistry } from "../../tools/registry.js";
import { ReadFileTool } from "../../tools/read_file.js";
import { WriteFileTool } from "../../tools/write_file.js";
import { EditFileTool } from "../../tools/edit_file.js";
import { BashTool } from "../../tools/bash.js";

export interface AgentArgs {
    prompt: string;
    dir: string;
    session: string;
}

// 手写 argv 解析（-prompt -dir -session）
export function parseAgentArgs(argv: string[]): AgentArgs | null {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const prompt = get("-prompt");
    if (!prompt) return null;
    return {
        prompt,
        dir: get("-dir") ?? ".",
        session: get("-session") ?? "cli_default_session",
    };
}

// 组装 engine（抽函数便于测试）：provider + CostTracker + registry 4 工具
export function assembleAgentEngine(
    provider: LLMProvider,
    modelName: string,
    session: Session,
    planMode: boolean,
): { engine: AgentEngine } {
    const tracked = new CostTracker(provider, modelName, session);
    const registry = newRegistry();
    registry.register(new ReadFileTool(session.workDir));
    registry.register(new WriteFileTool(session.workDir));
    registry.register(new EditFileTool(session.workDir));
    registry.register(new BashTool(session.workDir));
    // Thinking 开启
    const engine = new AgentEngine(tracked, registry, true, planMode);
    return { engine };
}

// 打印花费账单（main 跑完后调用）
function printCost(session: Session): void {
    console.log(
        `💰 花费: ¥${session.totalCostCNY.toFixed(6)} | ` +
            `Token: ${session.totalPromptTokens}/${session.totalCompletionTokens}`,
    );
}

// main（thin）：flag + 真实 provider + assemble + run
async function main(): Promise<void> {
    const args = parseAgentArgs(process.argv.slice(2));
    if (!args) {
        console.log('用法: teemo -prompt "任务" [-dir .] [-session id]');
        process.exit(1);
    }
    const { OpenAIProvider } = await import("../../provider/openai.js");
    const { globalSessionMgr } = await import("../../context/session.js");
    const provider = new OpenAIProvider("glm-4.5-air");
    const session = globalSessionMgr.getOrCreate(args.session, args.dir);
    session.append({ role: RoleUser, content: args.prompt });
    const { engine } = assembleAgentEngine(provider, "glm-4.5-air", session, true);
    const reporter = new TerminalReporter();
    await engine.run(session, reporter);
    printCost(session);
}

// 仅当直接运行（非 import）时执行 main
if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
