// 可观测性层 - 计费装饰器
// 装饰 LLMProvider，按注入的 pricing 表算花费写入 Session.recordUsage

import type { LLMProvider } from "../provider/interface.js";
import type { Message, ToolDefinition } from "../schema/message.js";
import type { Session } from "../context/session.js";
import type { Price } from "../config/schema.js";

export class CostTracker implements LLMProvider {
    constructor(
        private readonly next: LLMProvider,
        private readonly modelName: string,
        private readonly pricing: Record<string, Price>,
        private readonly session: Session | null,
    ) {}

    async generate(
        messages: Message[],
        availableTools: ToolDefinition[],
    ): Promise<Message> {
        const resp = await this.next.generate(messages, availableTools);
        if (resp.usage) {
            this.recordCost(resp.usage.promptTokens, resp.usage.completionTokens);
        }
        return resp;
    }

    private recordCost(promptTokens: number, completionTokens: number): void {
        const price = this.pricing[this.modelName];
        if (!price) return;
        const cost =
            (promptTokens * price.inputPrice +
                completionTokens * price.outputPrice) /
            1_000_000;
        this.session?.recordUsage(promptTokens, completionTokens, cost);
    }
}
