// 引擎层 - 死循环检测与强指令注入
// 注意：成功时清空整个 map（标记待评估）

import { createHash } from "node:crypto";
import type { Message, ToolCall, ToolResult } from "../schema/message.js";
import { RoleUser } from "../schema/message.js";

const FAILURE_THRESHOLD = 3;

// 对「工具名 + 参数」生成 md5 指纹
export function generateFingerprint(toolName: string, args: string): string {
    return createHash("md5").update(toolName).update(args).digest("hex");
}

export class ReminderInjector {
    private failures = new Map<string, number>();

    checkAndInject(lastToolCall: ToolCall, lastResult: ToolResult): Message | null {
        const fingerprint = generateFingerprint(
            lastToolCall.name,
            JSON.stringify(lastToolCall.arguments),
        );

        if (!lastResult.isError) {
            // 注意：成功清空整个 map（consecutiveFailures = make(...)）
            this.failures.clear();
            return null;
        }

        const failCount = (this.failures.get(fingerprint) ?? 0) + 1;
        this.failures.set(fingerprint, failCount);

        if (failCount >= FAILURE_THRESHOLD) {
            return this.buildNudge(failCount, lastToolCall.name);
        }
        return null;
    }

    private buildNudge(failCount: number, toolName: string): Message {
        const content = `[SYSTEM REMINDER 警告]
你似乎陷入了死循环。你刚刚连续 ${failCount} 次使用相同的参数调用了 '${toolName}' 工具，并且都失败了。
请立即停止这种无效的重试！你的注意力被当前的报错过度吸引了。
你需要：
1. 停止猜测参数。跳出当前的局部思维。
2. 彻底改变你的策略。
3. 如果你确实无法通过系统工具解决当前问题，请直接结束任务并向用户说明你需要什么人工帮助，而不是继续盲目消耗 API 资源尝试。`;
        return { role: RoleUser, content };
    }
}
