// 工具层 - subagent 探路者
// AgentRunner 接口定义在此，避免 tools→engine 反向依赖

import type { BaseTool } from "./registry.js";
import type { Registry } from "./registry.js";
import type { ToolDefinition } from "../schema/message.js";

// AgentRunner：engine 向 subagent 工具暴露的受限执行能力（engine 实现 runSub）
export interface AgentRunner {
    runSub(taskPrompt: string, readOnlyRegistry: Registry): Promise<string>;
}

export class SubagentTool implements BaseTool {
    constructor(
        private readonly runner: AgentRunner,
        private readonly readOnlyRegistry: Registry,
    ) {}

    name(): string {
        return "spawn_subagent";
    }

    definition(): ToolDefinition {
        return {
            name: this.name(),
            description:
                "派出一个专门用于深度探索（Exploration）的子智能体。当你需要阅读大量代码、跨文件查找逻辑时请调用此工具。它在探索完毕后，会给你返回一份极度精炼的摘要报告。",
            inputSchema: {
                type: "object",
                properties: {
                    task_prompt: {
                        type: "string",
                        description: "给子智能体下达的明确探索指令。",
                    },
                },
                required: ["task_prompt"],
            },
        };
    }

    async execute(args: unknown): Promise<string> {
        const taskPrompt = this.parseArgs(args);
        const summary = await this.runner.runSub(taskPrompt, this.readOnlyRegistry);
        return `【子智能体探索报告】:\n${summary}`;
    }

    private parseArgs(args: unknown): string {
        const a = args as { task_prompt?: string };
        if (typeof a.task_prompt !== "string") {
            throw new Error("参数解析失败: 缺少 task_prompt");
        }
        return a.task_prompt;
    }
}
