// 引擎层 - 轨迹回调接口

// Reporter 把引擎的执行轨迹推给外部（终端/飞书/...）
export interface Reporter {
    onThinking(): void;
    onToolCall(toolName: string, args: string): void;
    onToolResult(toolName: string, result: string, isError: boolean): void;
    onMessage(content: string): void;
}
