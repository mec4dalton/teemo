// 配置层 - JSON 加载与合并
// 三层浅合并（后者优先）→ 完整性校验 → $ENV 展开
// 工作区层：<workDir>/.teemo/config.json（与 skills/traces 同级）

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { isTeemoConfig, type TeemoConfig } from "./schema.js";

export interface LoadOptions {
    workDir?: string;
    workspaceConfigPath?: string;
    homeConfigPath?: string;
    env?: Record<string, string | undefined>;
}

// 读单层文件：不存在返回 null（表示跳过该层）
async function readLayer(file: string): Promise<Record<string, unknown> | null> {
    try {
        const text = await fs.readFile(file, "utf-8");
        return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
        const e = err as { code?: string };
        if (e?.code === "ENOENT") return null;
        if (err instanceof SyntaxError) {
            throw new Error(`配置文件 JSON 解析失败: ${file} —— ${String(err)}`);
        }
        throw err;
    }
}

// 顶层字段浅合并：后者覆盖前者，pricing 整体替换
function mergeLayers(layers: Record<string, unknown>[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const layer of layers) {
        for (const [k, v] of Object.entries(layer)) {
            merged[k] = v;
        }
    }
    return merged;
}

// "$VAR" → env.VAR；非 $ 开头原样返回（明文 key 场景）
function expandEnvRef(value: string, env: Record<string, string | undefined>): string {
    if (!value.startsWith("$")) return value;
    const name = value.slice(1);
    if (name === "") {
        throw new Error('apiKey 以 "$" 开头但未指定变量名（如 "$MY_KEY"）');
    }
    const expanded = env[name] ?? "";
    if (expanded === "") {
        throw new Error(`环境变量 ${name} 未设置或为空，请设置 ${name}`);
    }
    return expanded;
}

export async function loadConfig(options?: LoadOptions): Promise<TeemoConfig> {
    const env = options?.env ?? process.env;
    const workspacePath =
        options?.workspaceConfigPath ??
        path.join(options?.workDir ?? process.cwd(), ".teemo", "config.json");
    const homePath = options?.homeConfigPath ?? path.join(os.homedir(), ".teemo", "config.json");
    const envPath = env.TEEMO_CONFIG;

    const layers = await collectLayers({ workspacePath, homePath, envPath });
    if (layers.list.length === 0) {
        throw new Error(
            `未找到任何配置文件，查找路径：\n  ${workspacePath}\n  ${homePath}` +
                (envPath ? `\n  ${envPath}` : "") +
                `\n请创建 .teemo/config.json（可参考 demo-workspace/.teemo/config.json 样例）`,
        );
    }
    return buildConfig(layers.list, env);
}

// 逐层读文件；$TEEMO_CONFIG 已设置但文件不存在时直接报错（显式指定失效尽早暴露）
async function collectLayers(layerPaths: {
    workspacePath: string;
    homePath: string;
    envPath: string | undefined;
}): Promise<{ list: Record<string, unknown>[] }> {
    const list: Record<string, unknown>[] = [];
    for (const file of [layerPaths.workspacePath, layerPaths.homePath]) {
        const layer = await readLayer(file);
        if (layer) list.push(layer);
    }
    if (layerPaths.envPath) {
        const envLayer = await readLayer(layerPaths.envPath);
        if (envLayer === null) {
            throw new Error(`TEEMO_CONFIG 指向的文件不存在: ${layerPaths.envPath}`);
        }
        list.push(envLayer);
    }
    return { list };
}

// 合并 → 校验 → 展开 $ENV
function buildConfig(
    layers: Record<string, unknown>[],
    env: Record<string, string | undefined>,
): TeemoConfig {
    const merged = mergeLayers(layers);
    if (!isTeemoConfig(merged)) {
        throw new Error(
            `配置不完整或字段非法（必填：protocol/baseURL/model/apiKey/pricing，` +
                `protocol 取值 openai|claude），实际内容：${JSON.stringify(merged)}`,
        );
    }
    return { ...merged, apiKey: expandEnvRef(merged.apiKey, env) };
}
