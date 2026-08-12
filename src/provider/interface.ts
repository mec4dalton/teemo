// 大脑边界接口

import type { Message, ToolDefinition } from "../schema/message.js";

// LLMProvider 是唯一的大脑边界：换模型/厂商只需实现它
export interface LLMProvider {
    generate(
        messages: Message[],
        availableTools: ToolDefinition[],
    ): Promise<Message>;
}
