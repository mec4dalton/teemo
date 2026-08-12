import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentOpsRegistry, buildEngineFactory } from "@/cmd/agentops/index.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";
import { Session } from "@/context/session.js";
import { reporterStorage } from "@/feishu/bot.js";
import { FeishuReporter } from "@/feishu/reporter.js";

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
        const factory = buildEngineFactory(provider, "glm-4.5-air", registry);
        const session = new Session("s1", "/tmp");
        const engine = factory(session);
        expect(engine).toBeDefined();
    });
});
