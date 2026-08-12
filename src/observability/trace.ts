// 可观测性层 - 链路追踪

import { AsyncLocalStorage } from "node:async_hooks";
import * as path from "node:path";
import { promises as fs } from "node:fs";

export interface Span {
    name: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    attributes: Record<string, unknown>;
    children: Span[];
}

// 承载"当前 Span"，跨 await 透传，并发请求天然隔离
const spanStorage = new AsyncLocalStorage<Span>();

export function startSpan(name: string): Span {
    const parent = spanStorage.getStore();
    const span: Span = {
        name,
        startTime: Date.now(),
        endTime: 0,
        durationMs: 0,
        attributes: {},
        children: [],
    };
    if (parent) parent.children.push(span);
    return span;
}

export function endSpan(span: Span): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
}

export function addAttribute(span: Span, key: string, value: unknown): void {
    span.attributes[key] = value;
}

// withSpan：在 ALS 上下文内执行 fn，finally 自动 EndSpan
// onEnd 在 endSpan 后调用（成功或失败都跑），用于 run 失败也落盘 trace
export async function withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    onEnd?: (span: Span) => Promise<void> | void,
): Promise<T> {
    const span = startSpan(name);
    return spanStorage.run(span, async () => {
        try {
            return await fn(span);
        } finally {
            endSpan(span);
            if (onEnd) await onEnd(span);
        }
    });
}

// 落盘 Span 树 JSON，文件名 trace_<session>_<Date.now()>.json
export async function exportTraceToFile(
    rootSpan: Span,
    workDir: string,
    sessionID: string,
): Promise<string> {
    const traceDir = path.join(workDir, ".teemo", "traces");
    await fs.mkdir(traceDir, { recursive: true });
    const filename = path.join(
        traceDir,
        `trace_${sessionID}_${Date.now()}.json`,
    );
    await fs.writeFile(filename, JSON.stringify(rootSpan, null, 2), "utf-8");
    return filename;
}
