# Teemo

> 用 TypeScript 从零实现的微型 AI Agent 操作系统 —— **Harness over Framework**。

AI Agent 的壁垒不只在于调用的大模型的能力，也在于工程整体的**工具调度、上下文管理、安全拦截**策略。Teemo 把这套「Harness」用 TypeScript 手写出来：极简、可读、可改。

## 为什么有这个项目

我想从零开始手搓一个 Harness。目标不是「又一个 Agent 框架」，而是把 Agent 运行时的核心机制（ReAct 循环、上下文压缩、工具拦截、链路追踪）拆开，让初学小白可以轻松看懂、快速上手。

## 核心理念

- **Harness over Framework** —— 手写 ReAct 循环，不依赖任何 Agent 框架
- **极简 4 工具原语** —— `read_file` / `write_file` / `edit_file` / `bash`，图灵完备
- **subAgent 支持** —— 支持 subAgent 运行
- **状态外部化** —— 长程任务的计划与进度持久化进 `PLAN.md` / `TODO.md`，抛弃内存状态机
- **双协议支持** ——  OpenAI / Anthropic 协议都能走
- **全息可观测** —— Trace 链路落盘 + CostTracker 实时计费
- **安全审批** —— 高危操作经飞书人工放行

## 架构

| 模块 | 职责 | 目录 |
|---|---|---|
| 引擎 | ReAct 双阶段循环（Thinking + Action） | `src/engine/` |
| 大脑 | LLM Provider（智谱 GLM） | `src/provider/` |
| 上下文 | 压缩 / 恢复 / 技能 / 死循环提醒 | `src/context/` |
| 工具 | 4 工具原语 + 中间件拦截链 | `src/tools/` |
| 通道 | 飞书集成 + 审批 | `src/feishu/` |
| 可观测 | Trace + CostTracker | `src/observability/` |

**每轮 AgentLoop 循环**：Thinking（纯推理）→ Action（带工具调模型）→ 并发执行工具 → 结果回填 → 下一轮，直到模型不再调工具。

## 快速运行 Demo

```bash
git clone https://github.com/mec4dalton/teemo.git
cd teemo
npm install
export ZHIPU_API_KEY=你的智谱key
npx tsx src/cmd/teemo/index.ts -prompt "docker compose up 后 web 服务访问不了，排查配置" -dir demo-workspace
```

## 三种入口

同一套引擎，靠 `src/cmd/*` 不同组装产生三种形态：

| 入口 | 形态 | 用途 | 命令 |
|---|---|---|---|
| `teemo` | CLI 一次性 | 本地 YOLO 执行（开 Thinking + PlanMode） | `npx tsx src/cmd/teemo/index.ts -prompt "..." -dir 工作目录` |
| `agentops` | 飞书服务端 | 飞书机器人触发 + 高危审批（监听 :48080） | `npx tsx src/cmd/agentops/index.ts` |
| `bench` | 自动化评测 | 物理沙箱跑分 | `npx tsx src/cmd/bench/index.ts` |

## 配置

**必需**：`ZHIPU_API_KEY`（智谱 BigModel 平台获取）

**agentops 额外**：`FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_ENCRYPT_KEY` / `FEISHU_VERIFY_TOKEN`（飞书平台获取）

**工作区**（`-dir` 指定的目录）：

- `AGENTS.md` —— agent 行为指南（自动注入 system prompt）
- `.teemo/skills/*/SKILL.md` —— 技能外挂
- 任务素材文件（如 `docker-compose.yml`）

> 仓库里的 `demo-workspace/` 就是一个样例工作区，可以直接拿它试跑。

## 项目结构

```
teemo/
├── src/             生产源码（按层分包）
├── tests/           测试（镜像 src，引用源码用 @ 别名）
├── demo-workspace/  样例工作区（AGENTS.md + docker-compose 配置 + 排障技能）
└── package.json / tsconfig.json / vitest.config.ts
```

## 开发

```bash
npm test              # 134 个 Vitest 测试
npx tsc --noEmit      # 类型检查
```

测试约定：`tests/` 镜像 `src/` 结构，引用源码统一用 `@/*` 别名（`@/* → src/*`）。

## 致谢

- 原始 Go 版：[go-tiny-claw](https://github.com/bigwhite/publication)（Apache License 2.0 协议）

## 许可证

Apache License 2.0
