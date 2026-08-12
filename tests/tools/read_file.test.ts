import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { ReadFileTool } from "@/tools/read_file.js";

describe("ReadFileTool", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-rf-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("读取已存在的文件", async () => {
        await fs.writeFile(path.join(workDir, "a.txt"), "hello");
        const tool = new ReadFileTool(workDir);
        const out = await tool.execute({ path: "a.txt" });
        expect(out).toBe("hello");
    });

    it("文件不存在时抛错（供 Recovery 匹配）", async () => {
        const tool = new ReadFileTool(workDir);
        await expect(tool.execute({ path: "nope.txt" })).rejects.toThrow();
    });

    it("超长内容截断到 8000", async () => {
        const long = "x".repeat(9000);
        await fs.writeFile(path.join(workDir, "big.txt"), long);
        const tool = new ReadFileTool(workDir);
        const out = await tool.execute({ path: "big.txt" });
        expect(out.length).toBeLessThan(long.length);
        expect(out).toContain("截断");
    });

    it("定义正确", () => {
        const tool = new ReadFileTool(workDir);
        expect(tool.name()).toBe("read_file");
        expect(tool.definition().name).toBe("read_file");
    });
});
