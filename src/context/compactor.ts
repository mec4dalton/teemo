// 上下文工程层 - 上下文压缩
// 注意：.length 按 UTF-16 码元计（非字节），中文场景阈值含义有偏移

import type { Message } from "../schema/message.js";
import { RoleSystem, RoleUser, RoleAssistant } from "../schema/message.js";

const EARLY_TOOL_THRESHOLD = 200;
const EARLY_ASSISTANT_THRESHOLD = 200;
const MAX_KEEP = 1000;
const HEAD_TAIL = 500;

export class Compactor {
    constructor(
        private readonly maxChars: number,
        private readonly retainLastMsgs: number,
    ) {}

    compact(msgs: Message[]): Message[] {
        if (this.estimateLength(msgs) < this.maxChars) {
            return msgs;
        }
        const protectStart = Math.max(0, msgs.length - this.retainLastMsgs);
        return msgs.map((msg, i) => this.compactOne(msg, i >= protectStart));
    }

    private compactOne(msg: Message, inWorkingMemory: boolean): Message {
        if (msg.role === RoleSystem) return msg;
        const newMsg: Message = { ...msg };
        if (msg.role === RoleUser && msg.toolCallId) {
            newMsg.content = this.foldToolOutput(msg.content, inWorkingMemory);
        } else if (msg.role === RoleAssistant && msg.content !== "") {
            if (!inWorkingMemory && msg.content.length > EARLY_ASSISTANT_THRESHOLD) {
                newMsg.content = "...[早期的推理思考过程已折叠]...";
            }
        }
        return newMsg;
    }

    // 注意：.length 为码元（非字节）
    private foldToolOutput(content: string, inWorkingMemory: boolean): string {
        if (!inWorkingMemory) {
            if (content.length > EARLY_TOOL_THRESHOLD) {
                return `...[为了节省内存，早期的工具输出已被系统强制清理。` +
                    `原始长度: ${content.length} 字节]...`;
            }
            return content;
        }
        if (content.length > MAX_KEEP) {
            const head = content.slice(0, HEAD_TAIL);
            const tail = content.slice(content.length - HEAD_TAIL);
            const mid = content.length - MAX_KEEP;
            return `${head}\n\n...[内容过长，中间 ${mid} 字节已被系统截断]...\n\n${tail}`;
        }
        return content;
    }

    // 注意：.length 为码元；arguments 是 unknown，需 JSON.stringify 估算
    estimateLength(msgs: Message[]): number {
        let length = 0;
        for (const msg of msgs) {
            length += msg.content.length;
            if (msg.toolCalls) {
                for (const tc of msg.toolCalls) {
                    length += tc.name.length;
                    length += JSON.stringify(tc.arguments ?? "").length;
                }
            }
        }
        return length;
    }
}
