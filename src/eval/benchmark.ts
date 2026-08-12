// 评测层 - 自动化跑分
// 物理沙箱隔离 + exec 判卷（exit 0 判过）

import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { LLMProvider } from "../provider/interface.js";
import { RoleUser } from "../schema/message.js";
import { Session } from "../context/session.js";
import { AgentEngine } from "../engine/loop.js";
import { CostTracker } from "../observability/tracker.js";
import { newRegistry } from "../tools/registry.js";
import type { Registry } from "../tools/registry.js";
import { ReadFileTool } from "../tools/read_file.js";
import { WriteFileTool } from "../tools/write_file.js";
import { EditFileTool } from "../tools/edit_file.js";
import { BashTool } from "../tools/bash.js";

const execAsync = promisify(exec);

export interface TestCase {
    id: string;
    name: string;
    setupScript: string;
    taskPrompt: string;
    validateScript: string;
}

export interface TestResult {
    testCaseId: string;
    passed: boolean;
    totalCostCNY: number;
    durationMs: number;
    errorMsg: string;
}

export class BenchmarkRunner {
    constructor(
        private readonly modelName: string,
        private readonly provider: LLMProvider,
    ) {}

    async runSuite(testcases: TestCase[]): Promise<TestResult[]> {
        const results: TestResult[] = [];
        for (const tc of testcases) {
            const res = await this.runSingleTest(tc);
            results.push(res);
        }
        return results;
    }

    async runSingleTest(tc: TestCase): Promise<TestResult> {
        const startTime = Date.now();
        const workDir = await fs.mkdtemp(
            path.join(os.tmpdir(), `teemo-bench-${tc.id}-`),
        );
        try {
            const setupOk = await this.runSetup(tc.setupScript, workDir);
            if (!setupOk) {
                return this.fail(tc.id, startTime, "靶机 Setup 失败");
            }
            const session = await this.runAgent(tc, workDir);
            return await this.judge(tc, session, workDir, startTime);
        } finally {
            await fs.rm(workDir, { recursive: true, force: true });
        }
    }

    private async judge(
        tc: TestCase,
        session: Session,
        workDir: string,
        startTime: number,
    ): Promise<TestResult> {
        const validate = await this.runValidate(tc.validateScript, workDir);
        const duration = Date.now() - startTime;
        const errorMsg = validate.ok
            ? ""
            : `验证脚本执行失败: ${validate.output}`;
        return this.buildResult(tc.id, validate.ok, session.totalCostCNY, duration, errorMsg);
    }

    private buildResult(
        tcId: string,
        passed: boolean,
        cost: number,
        duration: number,
        errorMsg: string,
    ): TestResult {
        return {
            testCaseId: tcId,
            passed,
            totalCostCNY: cost,
            durationMs: duration,
            errorMsg,
        };
    }

    private async runSetup(script: string, workDir: string): Promise<boolean> {
        if (script === "") return true;
        try {
            await execAsync(script, { cwd: workDir });
            return true;
        } catch {
            return false;
        }
    }

    private async runAgent(tc: TestCase, workDir: string): Promise<Session> {
        const session = new Session(tc.id, workDir);
        session.append({ role: RoleUser, content: tc.taskPrompt });
        const registry = this.buildRegistry(workDir);
        const tracked = new CostTracker(this.provider, this.modelName, session);
        const engine = new AgentEngine(tracked, registry, false, false);
        await engine.run(session, null);
        return session;
    }

    private buildRegistry(workDir: string): Registry {
        const registry = newRegistry();
        registry.register(new ReadFileTool(workDir));
        registry.register(new WriteFileTool(workDir));
        registry.register(new EditFileTool(workDir));
        registry.register(new BashTool(workDir));
        return registry;
    }

    private async runValidate(
        script: string,
        workDir: string,
    ): Promise<{ ok: boolean; output: string }> {
        try {
            const { stdout } = await execAsync(script, { cwd: workDir });
            return { ok: true, output: stdout };
        } catch (err) {
            const e = err as { stdout?: string; stderr?: string };
            return { ok: false, output: (e.stdout ?? "") + (e.stderr ?? "") };
        }
    }

    private fail(tcId: string, startTime: number, msg: string): TestResult {
        return this.buildResult(tcId, false, 0, Date.now() - startTime, msg);
    }
}
