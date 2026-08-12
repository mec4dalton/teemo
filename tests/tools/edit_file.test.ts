import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { EditFileTool, fuzzyReplace } from "@/tools/edit_file.js";

describe("fuzzyReplace 四级匹配", () => {
    it("L1 精确匹配唯一", () => {
        expect(fuzzyReplace("aXb", "X", "Y")).toBe("aYb");
    });

    it("L1 多处命中报错", () => {
        expect(() => fuzzyReplace("XaX", "X", "Y")).toThrow(/2 处/);
    });

    it("L2 换行符归一（\\r\\n → \\n）", () => {
        const orig = "line1\r\nTARGET\r\nline3";
        expect(fuzzyReplace(orig, "TARGET", "DONE")).toContain("DONE");
    });

    it("L3 TrimSpace 匹配", () => {
        const orig = "foo TARGET bar";
        expect(fuzzyReplace(orig, "  TARGET  ", "DONE")).toBe("foo DONE bar");
    });

    // L3 count>1 不抛错、fallthrough 到 L4。"bar" 作为子串出现 2 次
    // （L3 trim count=2>1），但单独成行只 1 次（L4 逐行命中唯一）。
    it("L3 count>1 fallthrough 到 L4（不提前抛错）", () => {
        const orig = "bar\nfoobar";
        expect(fuzzyReplace(orig, "  bar  ", "DONE")).toBe("DONE\nfoobar");
    });

    it("L4 逐行去缩进匹配", () => {
        const orig = "    indented\n    TARGET\n    tail";
        expect(fuzzyReplace(orig, "TARGET", "DONE")).toContain("DONE");
    });

    it("零命中抛「未找到」", () => {
        expect(() => fuzzyReplace("abc", "XYZ", "Y")).toThrow();
    });
});

describe("EditFileTool", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-ef-"));
    });
    afterEach(async () => {
        await fs.rm(workDir, { recursive: true, force: true });
    });

    it("精确替换文件内容", async () => {
        await fs.writeFile(path.join(workDir, "a.txt"), "v1.0.0");
        const tool = new EditFileTool(workDir);
        const out = await tool.execute({
            path: "a.txt",
            old_text: "v1.0.0",
            new_text: "v2.0.0",
        });
        expect(out).toContain("成功");
        expect(await fs.readFile(path.join(workDir, "a.txt"), "utf-8")).toBe(
            "v2.0.0",
        );
    });
});
