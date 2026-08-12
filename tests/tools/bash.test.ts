import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { BashTool } from "@/tools/bash.js";

describe("BashTool", () => {
    let workDir: string;

    beforeEach(async () => {
        // realpath 规范化：macOS 上 os.tmpdir() 为 /var symlink，pwd 返回 /private/var 真实路径
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-bash-"));
        workDir = await fs.realpath(tmp);
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("执行命令并返回 stdout", async () => {
        const tool = new BashTool(workDir);
        const out = await tool.execute({ command: "echo hello" });
        expect(out.trim()).toBe("hello");
    });

    it("以 workDir 为 cwd", async () => {
        const tool = new BashTool(workDir);
        const out = await tool.execute({ command: "pwd" });
        expect(out.trim()).toBe(workDir);
    });

    it("命令失败时返回非 IsError 的报错文本（错误不抛出，转 output）", async () => {
        const tool = new BashTool(workDir);
        const out = await tool.execute({ command: "ls /no/such/dir" });
        expect(out).toMatch(/报错|No such/);
    });

    it("空输出返回成功提示", async () => {
        const tool = new BashTool(workDir);
        const out = await tool.execute({ command: "true" });
        expect(out).toContain("成功");
    });
});
