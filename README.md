# AgenticResearch

AgenticResearch 是一个基于产品文档开发的 Agentic Research Workspace 原型。当前版本实现了前端 MVP 工作台，并通过本地 LLM API 真实生成研究任务、Task Graph、Agent Console、Idea、实验计划、评估建议、Memory 和 LaTeX 论文初稿入口。

## 文档

- 产品需求文档：[docs/product-requirements.md](docs/product-requirements.md)
- 文档目录：[docs/README.md](docs/README.md)
- 模块子文档：[docs/modules](docs/modules)

## 技术栈

- Next.js
- React
- TypeScript
- CSS Modules-style global stylesheet
- lucide-react icons

## LLM 接口

项目会在服务端调用本地 OpenAI-compatible API。默认配置来自 [llm_api/use_case.txt](llm_api/use_case.txt)：

```text
LLM_API_BASE_URL=http://localhost:8313/v1
LLM_API_MODEL=claude-opus-4-5
LLM_API_KEY=dummy
LLM_API_ENDPOINT_ORDER=chat-json,chat
LLM_API_TIMEOUT_MS=300000
LLM_PAPER_BATCH_TIMEOUT_MS=180000
LLM_PLANNER_SYNTHESIS_TIMEOUT_MS=180000
```

可以复制 [.env.example](.env.example) 为 `.env.local` 后修改模型或地址。

当前实现默认优先尝试 `/v1/chat/completions` JSON mode，再尝试普通 `/v1/chat/completions`。`claude-opus-4-5` 在当前本地 OpenAI-compatible 服务上不支持 `/v1/responses`，所以默认不再回退到 `responses`；如果你切换到支持 Responses API 的模型，可以通过 `LLM_API_ENDPOINT_ORDER=responses,chat-json,chat` 打开。

Planner 的论文收集会拆成多个小请求并发执行：latest、top-cited、open-source、supplemental 四个 paper workers 先并行收集论文线索，然后 synthesis worker 再生成引用关系、比较表、报告和 idea。`LLM_PAPER_BATCH_TIMEOUT_MS` 控制单个 paper worker 的超时时间，`LLM_PLANNER_SYNTHESIS_TIMEOUT_MS` 控制最终合成步骤的超时时间。

页面会实时显示服务端执行状态日志，包括请求接收、prompt 构建、LLM 端点尝试、JSON 解析和 workspace 规范化阶段，用于定位本地 LLM 调用卡住或失败的位置。

## Workspace Archive

研究任务会自动保存到本地 [research-workspaces](research-workspaces) 目录。每个任务使用独立子目录，包含：

- `workspace.json`：完整可恢复状态，用于服务重启后继续编辑。
- `workspace.md`：可读 Markdown 副本，用于回看以往工作、论文线索、idea、coding plan、实验计划、评估和 paper draft。

启动开发服务后，页面会自动加载已有工作区；继续选择 idea、更新 Planner 或生成 Coding plan 时，会覆盖同一任务目录中的 JSON 和 Markdown 副本。

## Remote Coding Space

页面提供 Remote Coding Space 面板，可以输入 SSH 地址连接远程机器，连接成功后选择 coding space 目录，并在该目录下执行开发或实验命令。连接通过服务端调用本机 `ssh` 客户端完成，默认使用本机已有的 SSH config、key 或 agent，不在页面中收集密码。

连接后会展示远程机器的硬件与实时占用信息，包括 CPU、内存、磁盘和可用的 NVIDIA GPU。开启 Live 后，页面会定时刷新资源占用。

## 本地开发

安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

类型检查：

```powershell
npm run typecheck
```

生产构建：

```powershell
npm run build
```

## 当前 MVP 能力

1. 输入 research goal 后真实调用本地 LLM。
2. 由 LLM 生成 research task、任务列表和任务状态。
3. 由 LLM 生成 P0 闭环 Task Graph。
4. 点击节点查看输入、输出和 artifact。
5. 查看 LLM 生成的 Agent Console 执行记录。
6. 查看候选 idea、实验配置和待执行日志。
7. 在 Idea Workspace 中通过 chat 新增、合并、重写、选择候选 idea，并自动更新任务状态。
8. 查看 Evaluation 下一步建议。
9. 查看 Memory Explorer 和 LaTeX Paper Draft。
10. 自动保存研究工作到本地 JSON 状态和 Markdown 副本，并在服务重启后恢复任务列表。

说明：当前版本已经移除静态 mock 数据。实验指标不会被伪造，只有接入真实实验 Runner 后才会产生 metrics。

## 下一步开发建议

1. 实现 Agent Orchestrator 状态机。
2. 接入真实实验 Runner 和日志流。
3. 接入 Paper Memory / Experiment Memory。
4. 生成可下载的 LaTeX 草稿文件。
5. 为 Task Graph 节点增加独立重跑接口。