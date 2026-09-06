import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
    buildAgentOpsRegistry,
    buildEngineFactory,
    resolveFeishuCredentials,
} from "@/cmd/agentops/index.js";
import type { TeemoConfig } from "@/config/schema.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import { Session } from "@/context/session.js";
import { reporterStorage } from "@/feishu/bot.js";
import { FeishuReporter } from "@/feishu/reporter.js";
import type { Price } from "@/config/schema.js";

const PRICING: Record<string, Price> = {
    "glm-4.5-air": { inputPrice: 0.15, outputPrice: 0.15 },
};

class FakeProvider implements LLMProvider {
    async generate(_m: Message[], _t: ToolDefinition[]): Promise<Message> {
        return { role: RoleAssistant, content: "ok" };
    }
}

describe("buildAgentOpsRegistry", () => {
    it("注册 4 工具 + 挂安全 middleware", () => {
        const registry = buildAgentOpsRegistry("/tmp");
        const tools = registry.getAvailableTools();
        expect(tools).toHaveLength(4);
    });

    it("安全 middleware：read_file 白名单放行（非高危）", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-"));
        await fs.writeFile(path.join(dir, "x"), "hello");
        const registry = buildAgentOpsRegistry(dir);
        const fakeReporter = new FeishuReporter(
            { im: { message: { create: async () => undefined } } } as never,
            "chat-1",
        );
        await reporterStorage.run(fakeReporter, async () => {
            const result = await registry.execute({
                id: "t1",
                name: "read_file",
                arguments: { path: "x" },
            });
            expect(result.isError).toBe(false);
            expect(result.output).toContain("hello");
        });
    });
});

describe("buildEngineFactory", () => {
    it("factory 按 session 产出 engine（CostTracker 绑 session）", () => {
        const provider = new FakeProvider();
        const registry = buildAgentOpsRegistry("/tmp");
        const factory = buildEngineFactory(
            provider,
            "glm-4.5-air",
            PRICING,
            registry,
        );
        const session = new Session("s1", "/tmp");
        const engine = factory(session);
        expect(engine).toBeDefined();
    });
});

describe("resolveFeishuCredentials（配置优先 env 兜底）", () => {
    const BASE = {
        protocol: "openai" as const,
        baseURL: "https://x.example/v4",
        model: "glm-4.5-air",
        apiKey: "sk-x",
        pricing: {},
    };

    it("cfg.feishu 存在时直接使用配置值", () => {
        const cfg: TeemoConfig = {
            ...BASE,
            feishu: { appId: "cli-cfg", appSecret: "sec-cfg" },
        };
        expect(resolveFeishuCredentials(cfg)).toEqual({
            appId: "cli-cfg",
            appSecret: "sec-cfg",
        });
    });

    it("cfg.feishu 缺失时回落 env", () => {
        process.env.FEISHU_APP_ID = "cli-env";
        process.env.FEISHU_APP_SECRET = "sec-env";
        try {
            expect(resolveFeishuCredentials({ ...BASE })).toEqual({
                appId: "cli-env",
                appSecret: "sec-env",
            });
        } finally {
            delete process.env.FEISHU_APP_ID;
            delete process.env.FEISHU_APP_SECRET;
        }
    });
});
