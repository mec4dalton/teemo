// 大脑层 - Anthropic 协议 provider

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "./interface.js";
import type {
    Message,
    ToolCall,
    ToolDefinition,
    Usage,
} from "../schema/message.js";
import { RoleSystem, RoleUser, RoleAssistant } from "../schema/message.js";

export interface ClaudeProviderOptions {
    fetch?: typeof fetch;
    apiKey?: string;
}

export class ClaudeProvider implements LLMProvider {
    private readonly client: Anthropic;
    private readonly model: string;

    constructor(model: string, options?: ClaudeProviderOptions) {
        const apiKey = options?.apiKey ?? process.env.ZHIPU_API_KEY ?? "";
        if (!apiKey && !options?.fetch) {
            throw new Error("请设置 ZHIPU_API_KEY 环境变量");
        }
        this.model = model;
        this.client = new Anthropic({
            apiKey,
            baseURL: "https://open.bigmodel.cn/api/anthropic",
            fetch: options?.fetch as never,
        });
    }

    async generate(
        messages: Message[],
        availableTools: ToolDefinition[],
    ): Promise<Message> {
        const { systemPrompt, anthropicMsgs } = this.buildMessages(messages);
        const params: Anthropic.MessageCreateParamsNonStreaming = {
            model: this.model,
            max_tokens: 4096,
            messages: anthropicMsgs,
        };
        if (systemPrompt !== "") {
            params.system = systemPrompt;
        }
        const tools = this.buildTools(availableTools);
        if (tools.length > 0) params.tools = tools;

        const resp = await this.client.messages.create(params);
        return this.parseResponse(resp);
    }

    private buildMessages(messages: Message[]): {
        systemPrompt: string;
        anthropicMsgs: Anthropic.MessageParam[];
    } {
        let systemPrompt = "";
        const anthropicMsgs: Anthropic.MessageParam[] = [];
        for (const msg of messages) {
            if (msg.role === RoleSystem) {
                systemPrompt = msg.content;
            } else if (msg.role === RoleUser) {
                anthropicMsgs.push(this.buildUserMsg(msg));
            } else if (msg.role === RoleAssistant) {
                anthropicMsgs.push(this.buildAssistantMsg(msg));
            }
        }
        return { systemPrompt, anthropicMsgs };
    }

    private buildUserMsg(msg: Message): Anthropic.MessageParam {
        if (msg.toolCallId) {
            return {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: msg.toolCallId,
                        content: msg.content,
                    },
                ],
            };
        }
        return { role: "user", content: msg.content };
    }

    // 注意：即使 content 空，也下发空 TextBlock，避免智谱 1214 错误
    private buildAssistantMsg(msg: Message): Anthropic.MessageParam {
        const blocks: Anthropic.ContentBlockParam[] = [
            { type: "text", text: msg.content },
        ];
        for (const tc of msg.toolCalls ?? []) {
            blocks.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input: tc.arguments as Record<string, unknown>,
            });
        }
        return { role: "assistant", content: blocks };
    }

    private buildTools(tools: ToolDefinition[]): Anthropic.Tool[] {
        return tools.map((t) => {
            const schema = t.inputSchema as {
                properties?: Record<string, unknown>;
                required?: string[];
            };
            return {
                name: t.name,
                description: t.description,
                input_schema: {
                    type: "object",
                    properties: schema.properties ?? {},
                    required: schema.required ?? [],
                },
            };
        });
    }

    private parseResponse(resp: Anthropic.Message): Message {
        let content = "";
        const toolCalls: ToolCall[] = [];
        for (const block of resp.content) {
            if (block.type === "text") {
                content += block.text;
            } else if (block.type === "tool_use") {
                toolCalls.push(this.toToolCall(block));
            }
        }
        const result: Message = {
            role: RoleAssistant,
            content,
            usage: this.buildUsage(resp),
        };
        if (toolCalls.length > 0) result.toolCalls = toolCalls;
        return result;
    }

    private toToolCall(block: Anthropic.ToolUseBlock): ToolCall {
        return { id: block.id, name: block.name, arguments: block.input };
    }

    // input_tokens/output_tokens → promptTokens/completionTokens；全 0 时返回 undefined
    private buildUsage(resp: Anthropic.Message): Usage | undefined {
        const { input_tokens, output_tokens } = resp.usage;
        if (input_tokens === 0 && output_tokens === 0) return undefined;
        return { promptTokens: input_tokens, completionTokens: output_tokens };
    }
}
