import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "@/config/loader.js";

// 临时目录模拟三层配置文件；workspaceConfigPath/homeConfigPath/workDir 注入，
// 不碰真实 ~/.teemo/ 与真实 process.env.TEEMO_CONFIG
interface TestPaths {
    workDir: string;
    workspaceConfig: string;
    homeConfig: string;
    envConfig: string;
}

async function newTestPaths(): Promise<TestPaths> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "teemo-cfg-"));
    return {
        workDir,
        workspaceConfig: path.join(workDir, ".teemo", "config.json"),
        homeConfig: path.join(workDir, "home.json"),
        envConfig: path.join(workDir, "env.json"),
    };
}

async function writeJSON(file: string, obj: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(obj, null, 4), "utf-8");
}

const FULL = {
    protocol: "openai",
    baseURL: "https://workspace.example/api/coding/paas/v4",
    model: "deepseek-v4-flash",
    apiKey: "$MY_KEY",
    pricing: { "deepseek-v4-flash": { inputPrice: 1.5, outputPrice: 4.5 } },
};

describe("loadConfig", () => {
    let paths: TestPaths;
    beforeEach(async () => {
        paths = await newTestPaths();
        process.env.MY_KEY = "sk-test";
    });
    afterEach(async () => {
        delete process.env.MY_KEY;
        delete process.env.TEEMO_CONFIG;
        await fs.rm(paths.workDir, { recursive: true, force: true });
    });

    it("工作区层：加载并展开 $ENV", async () => {
        await writeJSON(paths.workspaceConfig, FULL);
        const cfg = await loadConfig({
            workspaceConfigPath: paths.workspaceConfig,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.apiKey).toBe("sk-test");
        expect(cfg.protocol).toBe("openai");
    });

    it("workDir 参数决定工作区层位置", async () => {
        await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
        await writeJSON(paths.workspaceConfig, FULL);
        const cfg = await loadConfig({
            workDir: paths.workDir,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.model).toBe("deepseek-v4-flash");
    });

    it("默认 workDir 为 cwd", async () => {
        const cwd = process.cwd();
        process.chdir(paths.workDir);
        try {
            await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
            await writeJSON(paths.workspaceConfig, FULL);
            const cfg = await loadConfig({
                homeConfigPath: paths.homeConfig,
                env: process.env,
            });
            expect(cfg.model).toBe("deepseek-v4-flash");
        } finally {
            process.chdir(cwd);
        }
    });

    it("home 层浅合并覆盖 model（pricing 整体替换）", async () => {
        await writeJSON(paths.workspaceConfig, FULL);
        await writeJSON(paths.homeConfig, {
            model: "glm-5.2",
            pricing: { "glm-5.2": { inputPrice: 0.2, outputPrice: 0.2 } },
        });
        const cfg = await loadConfig({
            workspaceConfigPath: paths.workspaceConfig,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.model).toBe("glm-5.2");
        expect(cfg.pricing["glm-5.2"].inputPrice).toBe(0.2);
        expect(cfg.pricing["deepseek-v4-flash"]).toBeUndefined();
    });

    it("TEEMO_CONFIG 层优先级最高", async () => {
        await writeJSON(paths.workspaceConfig, FULL);
        process.env.TEEMO_CONFIG = paths.envConfig;
        await writeJSON(paths.envConfig, { protocol: "claude" });
        const cfg = await loadConfig({
            workspaceConfigPath: paths.workspaceConfig,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.protocol).toBe("claude");
        expect(cfg.baseURL).toBe(FULL.baseURL);
    });

    it("TEEMO_CONFIG 指向的文件不存在时报错", async () => {
        await writeJSON(paths.workspaceConfig, FULL);
        process.env.TEEMO_CONFIG = paths.envConfig;
        await expect(
            loadConfig({
                workspaceConfigPath: paths.workspaceConfig,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/TEEMO_CONFIG/);
    });

    it("三层均无文件报错并列出查找路径", async () => {
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/\.teemo[/\\]config\.json/);
    });

    it("JSON 语法错误报错含文件路径", async () => {
        await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
        await fs.writeFile(paths.workspaceConfig, "{ not json", "utf-8");
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(paths.workspaceConfig);
    });

    it("路径是目录（EISDIR）时透传原始错误而非误报解析失败", async () => {
        await fs.mkdir(path.join(paths.workDir, ".teemo", "config.json"), {
            recursive: true,
        });
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toSatisfy((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            return /EISDIR|illegal operation/i.test(msg) && !msg.includes("解析失败");
        });
    });

    it("合并后缺字段报错（fail fast）", async () => {
        // 只有 home 层、无工作区层：合并结果缺 protocol 等字段
        await writeJSON(paths.homeConfig, { model: "glm-5.2" });
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/protocol/);
    });

    it("protocol 非法值报错", async () => {
        await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
        await writeJSON(paths.workspaceConfig, { ...FULL, protocol: "gemini" });
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/protocol/);
    });

    it("$ENV 展开为空报错（沿用 LLM_API_KEY 语义）", async () => {
        delete process.env.MY_KEY;
        await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
        await writeJSON(paths.workspaceConfig, FULL);
        await expect(
            loadConfig({
                workDir: paths.workDir,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/MY_KEY/);
    });

    it("home 层写明文 apiKey（非 $ENV）直接生效", async () => {
        await fs.mkdir(path.join(paths.workDir, ".teemo"), { recursive: true });
        await writeJSON(paths.workspaceConfig, FULL);
        await writeJSON(paths.homeConfig, { apiKey: "sk-plain" });
        const cfg = await loadConfig({
            workDir: paths.workDir,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.apiKey).toBe("sk-plain");
    });

    it("feishu 节明文两字段原样返回", async () => {
        await writeJSON(paths.workspaceConfig, {
            ...FULL,
            feishu: { appId: "cli-plain", appSecret: "sec-plain" },
        });
        const cfg = await loadConfig({
            workspaceConfigPath: paths.workspaceConfig,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.feishu).toEqual({ appId: "cli-plain", appSecret: "sec-plain" });
    });

    it("feishu 节 $ENV 引用展开为真实值", async () => {
        process.env.FEISHU_APP_ID = "cli-env";
        process.env.FEISHU_APP_SECRET = "sec-env";
        try {
            await writeJSON(paths.workspaceConfig, {
                ...FULL,
                feishu: { appId: "$FEISHU_APP_ID", appSecret: "$FEISHU_APP_SECRET" },
            });
            const cfg = await loadConfig({
                workspaceConfigPath: paths.workspaceConfig,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            });
            expect(cfg.feishu).toEqual({ appId: "cli-env", appSecret: "sec-env" });
        } finally {
            delete process.env.FEISHU_APP_ID;
            delete process.env.FEISHU_APP_SECRET;
        }
    });

    it("feishu 节半配（只有 appId）守卫拒绝", async () => {
        await writeJSON(paths.workspaceConfig, {
            ...FULL,
            feishu: { appId: "cli-x" },
        });
        await expect(
            loadConfig({
                workspaceConfigPath: paths.workspaceConfig,
                homeConfigPath: paths.homeConfig,
                env: process.env,
            }),
        ).rejects.toThrow(/feishu/);
    });

    it("无 feishu 节时 cfg.feishu 为 undefined（teemo/bench 无感）", async () => {
        await writeJSON(paths.workspaceConfig, FULL);
        const cfg = await loadConfig({
            workspaceConfigPath: paths.workspaceConfig,
            homeConfigPath: paths.homeConfig,
            env: process.env,
        });
        expect(cfg.feishu).toBeUndefined();
    });
});
