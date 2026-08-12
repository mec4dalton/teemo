// 大脑层 - OpenAI 协议 provider

import OpenAI from "openai";
import type { LLMProvider } from "./interface.js";
import type {
    Message,
    ToolCall,
    ToolDefinition,
    Usage,
} from "../schema/message.js";
import { RoleSystem, RoleUser, RoleAssistant } from "../schema/message.js";

export interface OpenAIProviderOptions {
    fetch?: typeof fetch;
    apiKey?: string;
}

export class OpenAIProvider implements LLMProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(model: string, options?: OpenAIProviderOptions) {
        const apiKey = options?.apiKey ?? process.env.ZHIPU_API_KEY ?? "";
        if (!apiKey && !options?.fetch) {
            throw new Error("请设置 ZHIPU_API_KEY 环境变量");
        }
        this.model = model;
        this.client = new OpenAI({
            apiKey,
            // 新 baseURL，无 trailing slash（SDK 自行拼 /chat/completions）
            baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
            fetch: options?.fetch as never,
        });
    }

    async generate(
        messages: Message[],
        availableTools: ToolDefinition[],
    ): Promise<Message> {
        const openaiMsgs = this.buildMessages(messages);
        const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
            model: this.model,
            messages: openaiMsgs,
        };
        const tools = this.buildTools(availableTools);
        if (tools.length > 0) params.tools = tools;
        const resp = await this.client.chat.completions.create(params);
        return this.parseResponse(resp);
    }

    private buildMessages(
        messages: Message[],
    ): OpenAI.ChatCompletionMessageParam[] {
        const result: OpenAI.ChatCompletionMessageParam[] = [];
        for (const msg of messages) {
            if (msg.role === RoleSystem) {
                result.push({ role: "system", content: msg.content });
            } else if (msg.role === RoleUser) {
                result.push(this.buildUserMsg(msg));
            } else if (msg.role === RoleAssistant) {
                result.push(this.buildAssistantMsg(msg));
            }
        }
        return result;
    }

    private buildUserMsg(msg: Message): OpenAI.ChatCompletionMessageParam {
        if (msg.toolCallId) {
            return {
                role: "tool",
                tool_call_id: msg.toolCallId,
                content: msg.content,
            };
        }
        return { role: "user", content: msg.content };
    }

    // 注意：即使 content 空，也下发（避免智谱 1214）
    private buildAssistantMsg(
        msg: Message,
    ): OpenAI.ChatCompletionAssistantMessageParam {
        const param: OpenAI.ChatCompletionAssistantMessageParam = {
            role: "assistant",
            content: msg.content,
        };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
            param.tool_calls = msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.arguments),
                },
            }));
        }
        return param;
    }

    private buildTools(
        tools: ToolDefinition[],
    ): OpenAI.ChatCompletionTool[] {
        return tools.map((t) => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: (t.inputSchema as Record<string, unknown>) ?? {},
            },
        }));
    }

    private parseResponse(resp: OpenAI.ChatCompletion): Message {
        const choice = resp.choices[0];
        const result: Message = {
            role: RoleAssistant,
            content: choice.message.content ?? "",
        };
        const toolCalls = this.extractToolCalls(choice.message.tool_calls);
        if (toolCalls.length > 0) result.toolCalls = toolCalls;
        result.usage = this.buildUsage(resp.usage);
        return result;
    }

    private extractToolCalls(
        toolCalls: OpenAI.ChatCompletionMessageToolCall[] | null | undefined,
    ): ToolCall[] {
        const result: ToolCall[] = [];
        for (const tc of toolCalls ?? []) {
            if (tc.type === "function") {
                result.push({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: JSON.parse(tc.function.arguments),
                });
            }
        }
        return result;
    }

    private buildUsage(
        usage: OpenAI.CompletionUsage | null | undefined,
    ): Usage | undefined {
        if (!usage) return undefined;
        if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
            return undefined;
        }
        return {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
        };
    }
}
