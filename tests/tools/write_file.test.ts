import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { WriteFileTool } from "@/tools/write_file.js";

describe("WriteFileTool", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-wf-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("写入新文件", async () => {
        const tool = new WriteFileTool(workDir);
        const out = await tool.execute({ path: "a.txt", content: "hi" });
        expect(out).toContain("成功");
        const got = await fs.readFile(path.join(workDir, "a.txt"), "utf-8");
        expect(got).toBe("hi");
    });

    it("父目录不存在时自动创建", async () => {
        const tool = new WriteFileTool(workDir);
        await tool.execute({ path: "sub/dir/b.txt", content: "x" });
        const got = await fs.readFile(path.join(workDir, "sub/dir/b.txt"), "utf-8");
        expect(got).toBe("x");
    });

    it("覆盖已存在的文件", async () => {
        await fs.writeFile(path.join(workDir, "a.txt"), "old");
        const tool = new WriteFileTool(workDir);
        await tool.execute({ path: "a.txt", content: "new" });
        const got = await fs.readFile(path.join(workDir, "a.txt"), "utf-8");
        expect(got).toBe("new");
    });

    it("缺少 content 抛错", async () => {
        const tool = new WriteFileTool(workDir);
        await expect(tool.execute({ path: "a.txt" })).rejects.toThrow();
    });
});
