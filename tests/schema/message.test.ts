import { describe, it, expect } from "vitest";
import {
    type Message,
    type ToolCall,
    RoleUser,
    RoleAssistant,
} from "@/schema/message.js";

describe("schema/message", () => {
    it("Role 常量正确", () => {
        expect(RoleUser).toBe("user");
        expect(RoleAssistant).toBe("assistant");
    });

    it("Message 可构造，optional 字段缺省", () => {
        const msg: Message = { role: RoleUser, content: "hi" };
        expect(msg.role).toBe("user");
        expect(msg.toolCalls).toBeUndefined();
        expect(msg.usage).toBeUndefined();
    });

    it("ToolCall.arguments 承载任意 JSON（unknown 替代 RawMessage）", () => {
        const call: ToolCall = {
            id: "1",
            name: "bash",
            arguments: { command: "ls -la" },
        };
        expect(call.arguments).toEqual({ command: "ls -la" });
    });

    it("Usage 可选，体现 *Usage 的可选语义（S3）", () => {
        const msg: Message = {
            role: RoleAssistant,
            content: "",
            usage: { promptTokens: 10, completionTokens: 5 },
        };
        expect(msg.usage?.promptTokens).toBe(10);
    });
});
