// 可观测性层 - 计费装饰器
// 装饰 LLMProvider，按 PricingModel 算花费写入 Session.recordUsage

import type { LLMProvider } from "../provider/interface.js";
import type { Message, ToolDefinition } from "../schema/message.js";
import type { Session } from "../context/session.js";

interface Price {
    inputPrice: number;
    outputPrice: number;
}

// 价格表：元/百万 token
export const PRICING_MODEL: Record<string, Price> = {
    "glm-4.5-air": { inputPrice: 0.15, outputPrice: 0.15 },
};

export class CostTracker implements LLMProvider {
    constructor(
        private readonly next: LLMProvider,
        private readonly modelName: string,
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
        const price = PRICING_MODEL[this.modelName];
        if (!price) return;
        const cost =
            (promptTokens * price.inputPrice +
                completionTokens * price.outputPrice) /
            1_000_000;
        this.session?.recordUsage(promptTokens, completionTokens, cost);
    }
}
