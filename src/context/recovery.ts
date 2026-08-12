// 上下文工程层 - 报错救援指南注入
// 注意：bash 超时文案联动 bash.ts 的「超时(30s)」，匹配「超时」即命中。

export class RecoveryManager {
    analyzeAndInject(toolName: string, rawError: string): string {
        const hint = this.hintFor(toolName, rawError);
        if (hint === "") return rawError;
        return `${rawError}\n\n[系统救援指南]: ${hint}`;
    }

    private hintFor(toolName: string, rawError: string): string {
        const lower = rawError.toLowerCase();
        switch (toolName) {
            case "edit_file":
                return this.editFileHint(rawError);
            case "read_file":
            case "write_file":
                return this.fileHint(lower);
            case "bash":
                return this.bashHint(rawError, lower);
            default:
                return "";
        }
    }

    private editFileHint(rawError: string): string {
        if (
            rawError.includes("在文件中未找到 old_text") ||
            rawError.includes("找不到该代码片段")
        ) {
            return this.editNotFoundHint();
        }
        if (
            rawError.includes("匹配到了多处") ||
            rawError.includes("提供更多上下文")
        ) {
            return this.editAmbiguousHint();
        }
        return "";
    }

    private editNotFoundHint(): string {
        return (
            "你提供的 old_text 与文件当前内容不一致，或者缺少必要的缩进。" +
            "请先使用 `read_file` 工具重新读取该文件，" +
            "获取最新、准确的内容后，再重新发起编辑。"
        );
    }

    private editAmbiguousHint(): string {
        return (
            "你的 old_text 不够具体，命中了多个相同代码块。" +
            "请在 old_text 中增加上下相邻的几行代码，以确保替换的唯一性。"
        );
    }

    private fileHint(lower: string): string {
        if (lower.includes("no such file or directory")) {
            return (
                "路径似乎不正确。请不要凭空猜测，先使用 `bash` 执行 " +
                "`ls -la` 或 `find . -name` 命令查找正确的目录结构和文件名。"
            );
        }
        if (lower.includes("permission denied")) {
            return this.filePermissionHint();
        }
        return "";
    }

    private bashHint(rawError: string, lower: string): string {
        if (lower.includes("command not found")) {
            return this.bashNotFoundHint();
        }
        // 注意：bash.ts 超时文案为「命令执行超时(30s)」，含「超时」
        if (rawError.includes("超时")) {
            return this.bashTimeoutHint();
        }
        if (lower.includes("syntax error")) {
            return this.bashSyntaxHint();
        }
        return "";
    }

    private bashNotFoundHint(): string {
        return (
            "系统中未安装该命令。请先思考：是否有替代命令？" +
            "或者你需要先编写脚本进行安装？"
        );
    }

    private bashTimeoutHint(): string {
        return (
            "该命令执行被超时强杀。如果它是一个常驻服务（如 server 或 watch），" +
            "请将其转入后台执行（例如使用 `nohup ... &`），不要阻塞主线程。"
        );
    }

    private filePermissionHint(): string {
        return (
            "你没有权限操作该文件。" +
            "请检查工作区限制，或者思考是否需要修改其他文件。"
        );
    }

    private bashSyntaxHint(): string {
        return (
            "Bash 语法错误。" +
            "请检查引号转义或特殊字符，确保命令在终端中可直接运行。"
        );
    }
}
