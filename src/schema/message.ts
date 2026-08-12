// 跨层共享的唯一数据结构

export type Role = "system" | "user" | "assistant";

export const RoleSystem: Role = "system";
export const RoleUser: Role = "user";
export const RoleAssistant: Role = "assistant";

// 单次大模型 API 调用的 Token 消耗
export interface Usage {
    promptTokens: number;
    completionTokens: number;
}

// 工具调用（arguments 用 unknown，延迟解析）
export interface ToolCall {
    id: string;
    name: string;
    arguments: unknown;
}

// 工具执行结果
export interface ToolResult {
    toolCallId: string;
    output: string;
    isError: boolean;
}

// 工具定义（向模型暴露）
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: unknown;
}

// 消息（usage 用 optional）
export interface Message {
    role: Role;
    content: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    usage?: Usage;
}
