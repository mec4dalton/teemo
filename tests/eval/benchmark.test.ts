import { describe, it, expect } from "vitest";
import { BenchmarkRunner, type TestCase } from "@/eval/benchmark.js";
import type { LLMProvider } from "@/provider/interface.js";
import type { Message, ToolDefinition } from "@/schema/message.js";
import { RoleAssistant } from "@/schema/message.js";

// mock provider：收到 task_prompt 后"假装"执行了 edit_file，让 ValidateScript 通过
class FakeEditProvider implements LLMProvider {
    async generate(
        messages: Message[],
        _tools: ToolDefinition[],
    ): Promise<Message> {
        // 简化：第二轮（含工具结果后）返回纯文本结束循环
        const hasToolResult = messages.some((m) => m.toolCallId);
        if (hasToolResult) {
            return { role: RoleAssistant, content: "已完成" };
        }
        // 第一轮：返回 write_file 工具调用（模拟 Agent 编辑 config.json）
        return {
            role: RoleAssistant,
            content: "",
            toolCalls: [
                {
                    id: "call_1",
                    name: "write_file",
                    arguments: {
                        path: "config.json",
                        content: '{"name": "x", "version": "v2.0.0"}',
                    },
                },
            ],
        };
    }
}

describe("BenchmarkRunner", () => {
    it("runSingleTest：SetupScript + Agent run + ValidateScript exit 0 判过", async () => {
        const runner = new BenchmarkRunner("glm-4.5-air", new FakeEditProvider());
        const tc: TestCase = {
            id: "test_pass",
            name: "改版本号",
            setupScript: 'echo \'{"name": "x", "version": "v1.0.0"}\' > config.json',
            taskPrompt: "把 config.json 的 version 改成 v2.0.0",
            validateScript: 'grep \'"version": "v2.0.0"\' config.json',
        };
        const result = await runner.runSingleTest(tc);
        expect(result.passed).toBe(true);
        expect(result.testCaseId).toBe("test_pass");
    });

    it("ValidateScript 失败时 passed=false + errorMsg", async () => {
        const runner = new BenchmarkRunner("glm-4.5-air", new FakeEditProvider());
        const tc: TestCase = {
            id: "test_fail",
            name: "改版本号（判卷必失败）",
            setupScript: 'echo \'{"name": "x", "version": "v1.0.0"}\' > config.json',
            taskPrompt: "把 config.json 的 version 改成 v2.0.0",
            validateScript: 'grep \'"version": "v9.9.9"\' config.json',
        };
        const result = await runner.runSingleTest(tc);
        expect(result.passed).toBe(false);
        expect(result.errorMsg).toContain("验证脚本");
    });

    it("runSuite 汇总多个用例结果", async () => {
        const runner = new BenchmarkRunner("glm-4.5-air", new FakeEditProvider());
        const cases: TestCase[] = [
            {
                id: "s1",
                name: "pass",
                setupScript: "",
                taskPrompt: "x",
                validateScript: "true",
            },
            {
                id: "s2",
                name: "fail",
                setupScript: "",
                taskPrompt: "x",
                validateScript: "false",
            },
        ];
        const results = await runner.runSuite(cases);
        expect(results).toHaveLength(2);
        expect(results[0].passed).toBe(true);
        expect(results[1].passed).toBe(false);
    });
});
