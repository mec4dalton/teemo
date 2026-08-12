// 飞书神经元层 - 高危审批管理

interface ApprovalResult {
    allowed: boolean;
    reason: string;
}

interface PendingTask {
    resolve: (r: ApprovalResult) => void;
}

// 发消息函数类型（解耦 FeishuReporter，避免 approval↔bot 循环依赖）
export type SendMsg = (text: string) => Promise<void> | void;

const DANGEROUS_PATTERNS = [
    /rm\s+-r/,
    /sudo\s+/,
    /drop\s+/,
    />.*\.go/,
    /nginx\s+-s/,
    /systemctl\s+/,
    /kill\s+/,
];

export class ApprovalManager {
    private readonly pending = new Map<string, PendingTask>();

    // 注意：挂起当前 async 调用（await Promise），直到 resolveApproval 唤醒。
    // 必须先注册 resolver 再 await sendMsg，否则同步的 resolveApproval 会落空。
    async waitForApproval(
        taskID: string,
        toolName: string,
        args: string,
        sendMsg?: SendMsg,
    ): Promise<ApprovalResult> {
        const notice = this.buildNotice(taskID, toolName, args);
        return new Promise<ApprovalResult>((resolve) => {
            this.pending.set(taskID, { resolve });
            void this.dispatch(taskID, notice, sendMsg);
        });
    }

    private async dispatch(
        taskID: string,
        notice: string,
        sendMsg?: SendMsg,
    ): Promise<void> {
        if (sendMsg) {
            await sendMsg(notice);
        } else {
            console.error(`[需要审批 TaskID: ${taskID}] ${notice}`);
        }
    }

    resolveApproval(taskID: string, allowed: boolean, reason: string): void {
        const task = this.pending.get(taskID);
        if (task) {
            task.resolve({ allowed, reason });
            this.pending.delete(taskID);
        }
    }

    private buildNotice(taskID: string, toolName: string, args: string): string {
        return `⚠️ **高危操作审批请求**
Agent 试图执行以下动作:
- 工具: ${toolName}
- 参数: ${args}

任务 ID: **${taskID}**

👉 请回复 "approve ${taskID}" 或 "reject ${taskID}" 决定是否放行。`;
    }
}

// 全局审批管理器单例
export const globalApprovalMgr = new ApprovalManager();

// IsDangerousCommand：黑名单正则判定
export function isDangerousCommand(toolName: string, args: string): boolean {
    if (toolName === "read_file") return false;
    if (toolName === "write_file" || toolName === "edit_file") return true;
    if (toolName === "bash") {
        return DANGEROUS_PATTERNS.some((p) => p.test(args));
    }
    return false;
}
