// edit_file 工具
// 四级模糊匹配；按码元计数（indexOf/length），非字节

import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { BaseTool } from "./registry.js";
import type { ToolDefinition } from "../schema/message.js";

export class EditFileTool implements BaseTool {
    constructor(private readonly workDir: string) {}

    name(): string {
        return "edit_file";
    }

    definition(): ToolDefinition {
        return {
            name: this.name(),
            description:
                "对现有文件进行局部的字符串替换。" +
                "请提供足够的 old_text 上下文以确保唯一性。",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "要修改的文件路径" },
                    old_text: { type: "string", description: "原有的文本" },
                    new_text: { type: "string", description: "替换成的新文本" },
                },
                required: ["path", "old_text", "new_text"],
            },
        };
    }

    async execute(args: unknown): Promise<string> {
        const { relPath, oldText, newText } = this.parseArgs(args);
        const fullPath = path.join(this.workDir, relPath);
        const original = await fs.readFile(fullPath, "utf-8");
        const updated = fuzzyReplace(original, oldText, newText);
        await fs.writeFile(fullPath, updated, "utf-8");
        return `✅ 成功修改文件: ${relPath}`;
    }

    private parseArgs(args: unknown): {
        relPath: string;
        oldText: string;
        newText: string;
    } {
        const a = args as { path?: string; old_text?: string; new_text?: string };
        if (typeof a.path !== "string") throw new Error("参数解析失败: 缺少 path");
        if (typeof a.old_text !== "string") {
            throw new Error("参数解析失败: 缺少 old_text");
        }
        if (typeof a.new_text !== "string") {
            throw new Error("参数解析失败: 缺少 new_text");
        }
        return { relPath: a.path, oldText: a.old_text, newText: a.new_text };
    }
}

// 四级模糊匹配（注意：indexOf/length 为码元）
export function fuzzyReplace(
    original: string,
    oldText: string,
    newText: string,
): string {
    const exact = tryExact(original, oldText, newText);
    if (exact !== null) return exact;

    const normOrig = original.replaceAll("\r\n", "\n");
    const normOld = oldText.replaceAll("\r\n", "\n");
    const normResult = tryExact(normOrig, normOld, newText);
    if (normResult !== null) return normResult;

    const trimmedResult = tryTrim(normOrig, normOld, newText);
    if (trimmedResult !== null) return trimmedResult;

    return lineByLineReplace(normOrig, normOld, newText);
}

// 返回 null 表示未命中（调用方继续下一级）
function tryExact(
    haystack: string,
    needle: string,
    newText: string,
): string | null {
    const count = countOccurrences(haystack, needle);
    if (count === 1) return replaceFirst(haystack, needle, newText);
    if (count > 1) {
        throw new Error(
            `old_text 匹配到了 ${count} 处，请提供更多的上下文代码以确保唯一性`,
        );
    }
    return null;
}

function tryTrim(
    normOrig: string,
    normOld: string,
    newText: string,
): string | null {
    // count>1 不抛错，fallthrough 到 L4
    const trimmed = normOld.trim();
    if (trimmed === "") return null;
    const count = countOccurrences(normOrig, trimmed);
    if (count === 1) return replaceFirst(normOrig, trimmed, newText);
    return null;
}

function lineByLineReplace(
    content: string,
    oldText: string,
    newText: string,
): string {
    const contentLines = content.split("\n");
    const oldLines = oldText.trim().split("\n").map((l) => l.trim());

    if (oldLines.length === 0 || contentLines.length < oldLines.length) {
        throw new Error("找不到该代码片段");
    }

    const range = findMatchRange(contentLines, oldLines);
    if (range === null) {
        throw new Error("在文件中未找到 old_text，请检查内容和缩进");
    }
    if (range.matchCount > 1) {
        throw new Error(
            `模糊匹配到了 ${range.matchCount} 处代码，请提供更多上下文以定位`,
        );
    }

    const before = contentLines.slice(0, range.start);
    const after = contentLines.slice(range.end);
    return [...before, newText, ...after].join("\n");
}

function findMatchRange(
    contentLines: string[],
    oldLines: string[],
): { start: number; end: number; matchCount: number } | null {
    let matchCount = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
        if (isMatchAt(contentLines, oldLines, i)) {
            matchCount++;
            start = i;
            end = i + oldLines.length;
        }
    }
    if (matchCount === 0) return null;
    return { start, end, matchCount };
}

function isMatchAt(
    contentLines: string[],
    oldLines: string[],
    i: number,
): boolean {
    for (let j = 0; j < oldLines.length; j++) {
        if (contentLines[i + j].trim() !== oldLines[j]) return false;
    }
    return true;
}

// 注意：用 indexOf（码元）计数，非字节
function countOccurrences(haystack: string, needle: string): number {
    if (needle === "") return 0;
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
        count++;
        idx = haystack.indexOf(needle, idx + needle.length);
    }
    return count;
}

// 注意：用 indexOf + slice（码元）做单次替换
function replaceFirst(
    haystack: string,
    needle: string,
    newText: string,
): string {
    const idx = haystack.indexOf(needle);
    return (
        haystack.slice(0, idx) + newText + haystack.slice(idx + needle.length)
    );
}
