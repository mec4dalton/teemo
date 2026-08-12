// 引擎层 - ReAct 主循环
// 每轮 Turn 用 withSpan 立即 EndSpan
// trace 走 AsyncLocalStorage（withSpan），engine 不传 ctx
// 工具并发用 Promise.all（registry 不抛错契约）
// 两循环都是 AgentEngine 的方法（TS 类方法不能跨文件定义）。
// （核心类聚合，类 loop.go 同文件结构）。

import type { LLMProvider } from "../provider/interface.js";
import type { Registry } from "../tools/registry.js";
import type { Message, ToolCall, ToolResult, ToolDefinition } from "../schema/message.js";
import { RoleAssistant, RoleUser, RoleSystem } from "../schema/message.js";
import { Session } from "../context/session.js";
import { Compactor } from "../context/compactor.js";
import { RecoveryManager } from "../context/recovery.js";
import { PromptComposer } from "../context/composer.js";
import { ReminderInjector } from "./reminder.js";
import type { Reporter } from "./reporter.js";
import { withSpan, addAttribute, exportTraceToFile, type Span } from "../observability/trace.js";

const WORKING_MEMORY_LIMIT = 20;
const PREVIEW_LEN = 200;
const MAX_SUB_TURNS = 10;
const DUMMY_USER_CONTENT =
    "[系统占位符] 这是为了保持上下文连贯性而注入的断点标记。" +
    "请继续执行你刚才的任务。";

const SUBAGENT_SYSTEM_PROMPT =
    "你是一个专门负责深度探索的探路者 (Explorer Subagent)。\n" +
    "你的任务是根据主架构师的指令，在当前工作区内仔细阅读代码、查阅日志，搜集足够的信息。\n\n" +
    "【核心纪律】\n" +
    "1. 你必须、且只能依靠内置工具（如 bash 的 find/grep，或 read_file）去寻找答案。绝对不允许凭空捏造或猜测！\n" +
    "2. 如果你没有找到确切的答案，你必须继续使用工具深入搜索。\n" +
    "3. 当且仅当你找到了确切的线索后，停止调用工具，直接输出一段纯文本作为你的终极汇报。";

interface ToolExecOutcome {
    observations: Message[];
    lastToolCall: ToolCall;
    lastResult: ToolResult;
}

// 单轮 Turn 的不变上下文（session/systemMsg/reporter 跨多方法透传）
interface TurnContext {
    session: Session;
    systemMsg: Message;
    reporter: Reporter | null;
}

export class AgentEngine {
    private readonly compactor: Compactor;
    private readonly recovery: RecoveryManager;
    private readonly injector: ReminderInjector;

    constructor(
        private readonly provider: LLMProvider,
        private readonly registry: Registry,
        private readonly enableThinking: boolean,
        private readonly planMode: boolean,
    ) {
        this.compactor = new Compactor(200000, 6);
        this.recovery = new RecoveryManager();
        this.injector = new ReminderInjector();
    }

    async run(session: Session, reporter: Reporter | null): Promise<void> {
        await withSpan(
            "Agent.Run",
            async (rootSpan) => {
                addAttribute(rootSpan, "SessionID", session.id);
                addAttribute(rootSpan, "WorkDir", session.workDir);
                await this.runLoop(session, reporter);
            },
            // spec「成功或失败落盘」：finally endSpan 后 export（runLoop 抛错也落盘）
            // best-effort：落盘失败 try/catch 吞掉，避免覆盖原 exception
            async (rootSpan) => {
                try {
                    await exportTraceToFile(rootSpan, session.workDir, session.id);
                } catch {
                    // 落盘失败静默，不掩盖 runLoop 的原始错误
                }
            },
        );
    }

    private async runLoop(session: Session, reporter: Reporter | null): Promise<void> {
        const composer = new PromptComposer(session.workDir, this.planMode);
        const systemMsg = await composer.build();
        const ctx: TurnContext = { session, systemMsg, reporter };
        let turnCount = 0;
        let shouldContinue = true;
        while (shouldContinue) {
            turnCount++;
            shouldContinue = await this.runTurn(turnCount, ctx);
        }
    }

    // 每轮 Turn 用 withSpan 立即 EndSpan（修 defer-in-loop）
    private async runTurn(turnCount: number, ctx: TurnContext): Promise<boolean> {
        const spanName = `Turn-${turnCount}`;
        return withSpan(spanName, (turnSpan) => this.runTurnBody(turnSpan, ctx));
    }

    private async runTurnBody(turnSpan: Span, ctx: TurnContext): Promise<boolean> {
        const tools = this.registry.getAvailableTools();
        const compacted = await this.prepareContext(ctx);
        addAttribute(turnSpan, "context_message_count", compacted.length);
        const { thinking, context } = await this.buildActionContext(compacted, ctx);
        const actionResp = await this.executeAction(context, tools);
        this.recordAssistant(ctx, thinking, actionResp);
        if (!actionResp.toolCalls || actionResp.toolCalls.length === 0) {
            return false;
        }
        const outcome = await this.executeToolsConcurrently(
            actionResp.toolCalls,
            ctx.reporter,
        );
        ctx.session.append(...outcome.observations);
        this.injectReminder(ctx, outcome.lastToolCall, outcome.lastResult);
        return true;
    }

    private async prepareContext(ctx: TurnContext): Promise<Message[]> {
        const memory = ctx.session.getWorkingMemory(WORKING_MEMORY_LIMIT);
        const withDummy = this.prefixDummyIfNeeded(memory);
        return this.compactor.compact([ctx.systemMsg, ...withDummy]);
    }

    private prefixDummyIfNeeded(memory: Message[]): Message[] {
        if (memory.length === 0 || memory[0].role === RoleUser) {
            return memory;
        }
        const dummy: Message = { role: RoleUser, content: DUMMY_USER_CONTENT };
        return [dummy, ...memory];
    }

    private async thinkPhase(compacted: Message[], reporter: Reporter | null): Promise<string> {
        if (reporter) reporter.onThinking();
        return withSpan("LLM.Thinking", async () => {
            const resp = await this.provider.generate(compacted, []);
            return resp.content;
        });
    }

    // thinking 作为 Assistant 消息追加进 Action 输入上下文（Action 模型能看到推理）
    private async buildActionContext(
        compacted: Message[],
        ctx: TurnContext,
    ): Promise<{ thinking: string; context: Message[] }> {
        const thinking = this.enableThinking
            ? await this.thinkPhase(compacted, ctx.reporter)
            : "";
        const context = thinking !== ""
            ? [...compacted, { role: RoleAssistant, content: thinking }]
            : compacted;
        return { thinking, context };
    }

    private async executeAction(
        compacted: Message[],
        tools: ToolDefinition[],
    ): Promise<Message> {
        return withSpan("LLM.Action", async () => {
            return this.provider.generate(compacted, tools);
        });
    }

    private recordAssistant(
        ctx: TurnContext,
        thinking: string,
        actionResp: Message,
    ): void {
        const content = (thinking + "\n" + actionResp.content).trim();
        const finalMsg: Message = {
            role: RoleAssistant,
            content,
            toolCalls: actionResp.toolCalls,
        };
        ctx.session.append(finalMsg);
        if (actionResp.content !== "" && ctx.reporter) {
            ctx.reporter.onMessage(actionResp.content);
        }
    }

    // Promise.all 并发，registry 不抛错（单失败不中断）
    private async executeToolsConcurrently(
        toolCalls: ToolCall[],
        reporter: Reporter | null,
    ): Promise<ToolExecOutcome> {
        const results = await Promise.all(
            toolCalls.map((call) => this.executeOneTool(call, reporter)),
        );
        return {
            observations: results.map((r) => r.observation),
            lastToolCall: toolCalls[0],
            lastResult: results[0].result,
        };
    }

    private async executeOneTool(
        call: ToolCall,
        reporter: Reporter | null,
    ): Promise<{ observation: Message; result: ToolResult }> {
        if (reporter) reporter.onToolCall(call.name, JSON.stringify(call.arguments));
        const result = await this.registry.execute(call);
        const finalOutput = result.isError
            ? this.recovery.analyzeAndInject(call.name, result.output)
            : result.output;
        if (reporter) reporter.onToolResult(call.name, this.truncate(finalOutput, PREVIEW_LEN), result.isError);
        const observation: Message = {
            role: RoleUser,
            content: finalOutput,
            toolCallId: call.id,
        };
        return { observation, result };
    }

    private injectReminder(
        ctx: TurnContext,
        lastToolCall: ToolCall,
        lastResult: ToolResult,
    ): void {
        const reminder = this.injector.checkAndInject(lastToolCall, lastResult);
        if (reminder) ctx.session.append(reminder);
    }

    private truncate(s: string, max: number): string {
        return s.length > max ? s.slice(0, max) + "... (已截断)" : s;
    }

    // RunSub：subagent 受限循环。不依赖外部 Session，打完就跑。
    async runSub(taskPrompt: string, readOnlyRegistry: Registry): Promise<string> {
        const history: Message[] = [
            this.subagentSystemMsg(),
            { role: RoleUser, content: taskPrompt },
        ];
        for (let turn = 1; turn <= MAX_SUB_TURNS; turn++) {
            const outcome = await this.runSubTurn(history, readOnlyRegistry);
            if (outcome.done) return outcome.summary;
        }
        throw new Error(this.subagentRecallMsg());
    }

    // 单轮 subagent：生成→判断是否汇报→否则执行工具回填。done=true 表示已拿到 summary。
    private async runSubTurn(
        history: Message[],
        readOnlyRegistry: Registry,
    ): Promise<{ done: boolean; summary: string }> {
        const tools = readOnlyRegistry.getAvailableTools();
        const compacted = this.compactor.compact(history);
        const actionResp = await this.provider.generate(compacted, tools);
        history.push(actionResp);
        if (!actionResp.toolCalls || actionResp.toolCalls.length === 0) {
            return { done: true, summary: actionResp.content };
        }
        const observations = await this.executeSubTools(actionResp.toolCalls, readOnlyRegistry);
        history.push(...observations);
        return { done: false, summary: "" };
    }

    private subagentSystemMsg(): Message {
        return {
            role: RoleSystem,
            content: SUBAGENT_SYSTEM_PROMPT,
        };
    }

    private subagentRecallMsg(): string {
        return `子智能体探索过于深入，超过 ${MAX_SUB_TURNS} 轮被强制召回，请主 Agent 给它更明确的指令`;
    }

    private async executeSubTools(
        toolCalls: ToolCall[],
        readOnlyRegistry: Registry,
    ): Promise<Message[]> {
        const results = await Promise.all(
            toolCalls.map(async (call) => {
                const result = await readOnlyRegistry.execute(call);
                const output = result.isError
                    ? this.recovery.analyzeAndInject(call.name, result.output)
                    : result.output;
                return { role: RoleUser, content: output, toolCallId: call.id } as Message;
            }),
        );
        return results;
    }
}
