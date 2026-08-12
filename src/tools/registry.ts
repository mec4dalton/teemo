// 工具注册表 + 全局中间件拦截链
// 注：trace 埋点已用 withSpan 注入到 execute

import type { ToolCall, ToolDefinition, ToolResult } from "../schema/message.js";
import { withSpan } from "../observability/trace.js";

export interface BaseTool {
    name(): string;
    definition(): ToolDefinition;
    execute(args: unknown): Promise<string>;
}

// 中间件签名：返回是否放行 + 拦截原因
// 联合类型兼容 sync/async（接通 feishu waitForApproval 的 Promise 挂起）
export type MiddlewareFunc = (
    call: ToolCall,
) =>
    | Promise<{ allowed: boolean; rejectReason: string }>
    | { allowed: boolean; rejectReason: string };

export interface Registry {
    register(tool: BaseTool): void;
    use(mw: MiddlewareFunc): void;
    getAvailableTools(): ToolDefinition[];
    execute(call: ToolCall): Promise<ToolResult>;
}

export class RegistryImpl implements Registry {
    private readonly tools = new Map<string, BaseTool>();
    private readonly middlewares: MiddlewareFunc[] = [];

    register(tool: BaseTool): void {
        const n = tool.name();
        if (this.tools.has(n)) {
            console.warn(`[Warning] 工具 '${n}' 已注册，将被覆盖。`);
        }
        this.tools.set(n, tool);
        console.log(`[Registry] 成功挂载工具: ${n}`);
    }

    use(mw: MiddlewareFunc): void {
        this.middlewares.push(mw);
    }

    getAvailableTools(): ToolDefinition[] {
        return Array.from(this.tools.values()).map((t) => t.definition());
    }

    async execute(call: ToolCall): Promise<ToolResult> {
        return withSpan(`tool.${call.name}`, async () => {
            const tool = this.tools.get(call.name);
            if (!tool) return this.notFound(call);
            const blocked = await this.checkMiddlewares(call);
            if (blocked) return blocked;
            return this.runTool(call, tool);
        });
    }

    private notFound(call: ToolCall): ToolResult {
        return {
            toolCallId: call.id,
            output: `Error: 系统中不存在名为 '${call.name}' 的工具。`,
            isError: true,
        };
    }

    private async checkMiddlewares(
        call: ToolCall,
    ): Promise<ToolResult | null> {
        for (const mw of this.middlewares) {
            const { allowed, rejectReason } = await mw(call);
            if (!allowed) {
                console.log(
                    `[Registry] ⚠️ 工具 ${call.name} 被 Middleware 拦截: ${rejectReason}`,
                );
                return {
                    toolCallId: call.id,
                    output: `执行被系统拦截。原因: ${rejectReason}`,
                    isError: true,
                };
            }
        }
        return null;
    }

    // 内部 try/catch 兜底，错误转 IsError result，不向并发层抛出
    private async runTool(
        call: ToolCall,
        tool: BaseTool,
    ): Promise<ToolResult> {
        try {
            const output = await tool.execute(call.arguments);
            return { toolCallId: call.id, output, isError: false };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                toolCallId: call.id,
                output: `Error executing ${call.name}: ${msg}`,
                isError: true,
            };
        }
    }
}

export function newRegistry(): Registry {
    return new RegistryImpl();
}
