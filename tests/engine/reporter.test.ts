import { describe, it, expect } from "vitest";
import type { Reporter } from "@/engine/reporter.js";
import { TerminalReporter } from "@/engine/terminal_reporter.js";

// 用一个记录调用的 mock reporter 验证接口契约
class RecordingReporter implements Reporter {
    calls: string[] = [];
    onThinking(): void {
        this.calls.push("thinking");
    }
    onToolCall(toolName: string, args: string): void {
        this.calls.push(`tool:${toolName}:${args}`);
    }
    onToolResult(toolName: string, result: string, isError: boolean): void {
        this.calls.push(`result:${toolName}:${isError}:${result}`);
    }
    onMessage(content: string): void {
        this.calls.push(`message:${content}`);
    }
}

describe("Reporter 接口", () => {
    it("实现类满足四个回调方法（无 ctx，D3 ALS）", () => {
        const r: Reporter = new RecordingReporter();
        r.onThinking();
        r.onToolCall("bash", '{"command":"ls"}');
        r.onToolResult("bash", "ok", false);
        r.onMessage("hello");
        const rec = r as RecordingReporter;
        expect(rec.calls).toEqual([
            "thinking",
            'tool:bash:{"command":"ls"}',
            "result:bash:false:ok",
            "message:hello",
        ]);
    });
});

describe("TerminalReporter", () => {
    it("implements Reporter 且四个方法不抛错（输出到 stdout）", () => {
        const t: Reporter = new TerminalReporter();
        // 验证方法存在且不抛错（输出到 stdout，测试不断言打印内容）
        expect(() => {
            t.onThinking();
            t.onToolCall("bash", '{"command":"ls"}');
            t.onToolResult("bash", "ok", false);
            t.onToolResult("bash", "err", true);
            t.onMessage("hello");
            t.onMessage(""); // 空内容应安全跳过
        }).not.toThrow();
    });
});
