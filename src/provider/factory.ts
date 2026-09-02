// 大脑层 - provider 工厂
// 按 protocol 字段产出对应协议实现，入口处替代直接 new

import type { TeemoConfig } from "../config/schema.js";
import type { LLMProvider } from "./interface.js";
import { OpenAIProvider } from "./openai.js";
import { ClaudeProvider } from "./claude.js";

type ProviderConfig = Pick<TeemoConfig, "protocol" | "baseURL" | "model" | "apiKey">;

export function createProvider(cfg: ProviderConfig): LLMProvider {
    const options = { baseURL: cfg.baseURL, apiKey: cfg.apiKey };
    if (cfg.protocol === "openai") {
        return new OpenAIProvider(cfg.model, options);
    }
    if (cfg.protocol === "claude") {
        return new ClaudeProvider(cfg.model, options);
    }
    throw new Error(`不支持的 protocol: ${String(cfg.protocol)}`);
}
