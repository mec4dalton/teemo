// 配置层 - 类型定义与运行时守卫
// 扁平单套结构：protocol 指定协议，pricing 键为模型名

export const PROTOCOLS = ["openai", "claude"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export interface Price {
    inputPrice: number;
    outputPrice: number;
}

export interface TeemoConfig {
    protocol: Protocol;
    baseURL: string;
    model: string;
    apiKey: string;
    pricing: Record<string, Price>;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isPrice = (v: unknown): v is Price => {
    if (typeof v !== "object" || v === null) return false;
    const p = v as Record<string, unknown>;
    return typeof p.inputPrice === "number" && typeof p.outputPrice === "number";
};

const isPricing = (v: unknown): v is Record<string, Price> => {
    if (typeof v !== "object" || v === null) return false;
    const entries = Object.values(v as Record<string, unknown>);
    return entries.length > 0 && entries.every(isPrice);
};

// 运行时守卫：JSON 解析结果无类型保障，加载期用守卫判完整（fail fast）
export function isTeemoConfig(v: unknown): v is TeemoConfig {
    if (typeof v !== "object" || v === null) return false;
    const c = v as Record<string, unknown>;
    return (
        PROTOCOLS.includes(c.protocol as Protocol) &&
        isString(c.baseURL) &&
        c.baseURL !== "" &&
        isString(c.model) &&
        c.model !== "" &&
        isString(c.apiKey) &&
        isPricing(c.pricing)
    );
}
