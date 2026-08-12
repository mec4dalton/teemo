// 飞书神经元层 - FeishuReporter
// 用 @larksuiteoapi/node-sdk 的 client.im.message.create 发消息

import type { Reporter } from "../engine/reporter.js";

// Lark client 的最小结构（仅用 im.message.create，避免耦合 SDK 完整类型）
export interface LarkMessager {
    im: {
        message: {
            create: (req: {
                params: { receive_id_type: string };
                data: { receive_id: string; content: string; msg_type: string };
            }) => Promise<unknown>;
        };
    };
}

export class FeishuReporter implements Reporter {
    constructor(
        private readonly client: LarkMessager,
        private readonly chatId: string,
    ) {}

    // 公开方法：发文本消息（也供 ApprovalManager 的 sendMsg 参数用）
    async sendMsg(text: string): Promise<void> {
        await this.client.im.message.create({
            params: { receive_id_type: "chat_id" },
            data: {
                receive_id: this.chatId,
                content: JSON.stringify({ text }),
                msg_type: "text",
            },
        });
    }

    onThinking(): void {
        void this.sendMsg("🤔 模型正在慢思考 (Thinking)...");
    }

    onToolCall(toolName: string, args: string): void {
        void this.sendMsg(`🛠️ **正在执行工具**：\`${toolName}\`\n参数：\`${args}\``);
    }

    onToolResult(toolName: string, result: string, isError: boolean): void {
        if (isError) {
            void this.sendMsg(`⚠️ **执行报错** (${toolName})：\n${result}`);
            return;
        }
        void this.sendMsg(`✅ **执行成功** (${toolName})`);
    }

    onMessage(content: string): void {
        void this.sendMsg(content);
    }
}
