import { describe, it, expect } from "vitest";
import { newRegistry, type BaseTool } from "@/tools/registry.js";
import type { ToolCall, ToolDefinition } from "@/schema/message.js";

// 一个总是返回固定串的假工具，供测试复用
function fakeTool(n: string, output: string): BaseTool {
    return {
        name: () => n,
        definition: (): ToolDefinition => ({
            name: n,
            description: "fake",
            inputSchema: { type: "object" },
        }),
        execute: async () => output,
    };
}

const call = (n: string): ToolCall => ({ id: "c1", name: n, arguments: {} });

describe("Registry", () => {
    it("注册后 getAvailableTools 返回 definition", () => {
        const r = newRegistry();
        r.register(fakeTool("a", "A"));
        expect(r.getAvailableTools()).toHaveLength(1);
        expect(r.getAvailableTools()[0].name).toBe("a");
    });

    it("execute 路由到正确工具", async () => {
        const r = newRegistry();
        r.register(fakeTool("a", "A"));
        const res = await r.execute(call("a"));
        expect(res.output).toBe("A");
        expect(res.isError).toBe(false);
    });

    it("工具不存在返回 IsError", async () => {
        const r = newRegistry();
        const res = await r.execute(call("ghost"));
        expect(res.isError).toBe(true);
        expect(res.output).toContain("不存在");
    });

    it("中间件拦截返回 IsError + 拒绝原因", async () => {
        const r = newRegistry();
        r.register(fakeTool("a", "A"));
        r.use(async () => ({ allowed: false, rejectReason: "高危" }));
        const res = await r.execute(call("a"));
        expect(res.isError).toBe(true);
        expect(res.output).toContain("高危");
    });

    it("中间件放行则执行（D8）", async () => {
        const r = newRegistry();
        r.register(fakeTool("a", "A"));
        r.use(async () => ({ allowed: true, rejectReason: "" }));
        const res = await r.execute(call("a"));
        expect(res.output).toBe("A");
    });

    it("工具 throw 时 execute 兜底成 IsError result（不向并发层抛出）", async () => {
        const boom: BaseTool = {
            name: () => "boom",
            definition: () => ({ name: "boom", description: "", inputSchema: {} }),
            execute: async () => {
                throw new Error("炸了");
            },
        };
        const r = newRegistry();
        r.register(boom);
        const res = await r.execute(call("boom"));
        expect(res.isError).toBe(true);
        expect(res.output).toContain("炸了");
    });
});
