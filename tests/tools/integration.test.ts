import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { newRegistry } from "@/tools/registry.js";
import { ReadFileTool } from "@/tools/read_file.js";
import { WriteFileTool } from "@/tools/write_file.js";
import { EditFileTool } from "@/tools/edit_file.js";
import { BashTool } from "@/tools/bash.js";
import type { ToolCall } from "@/schema/message.js";

describe("工具集成", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-int-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("四工具注册 + write→read→edit→bash 端到端", async () => {
        const r = newRegistry();
        r.register(new ReadFileTool(workDir));
        r.register(new WriteFileTool(workDir));
        r.register(new EditFileTool(workDir));
        r.register(new BashTool(workDir));
        expect(r.getAvailableTools()).toHaveLength(4);

        const call = (name: string, args: unknown): ToolCall => ({
            id: name,
            name,
            arguments: args,
        });

        // write
        let res = await r.execute(call("write_file", { path: "cfg.txt", content: "v1" }));
        expect(res.isError).toBe(false);

        // read
        res = await r.execute(call("read_file", { path: "cfg.txt" }));
        expect(res.output).toBe("v1");

        // edit
        res = await r.execute(
            call("edit_file", { path: "cfg.txt", old_text: "v1", new_text: "v2" }),
        );
        expect(res.isError).toBe(false);

        // bash 验证
        res = await r.execute(call("bash", { command: "cat cfg.txt" }));
        expect(res.output.trim()).toBe("v2");
    });
});
