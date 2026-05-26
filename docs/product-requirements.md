# Agentic Research Workspace 产品需求文档

版本：0.1
日期：2026-05-11
状态：草案

## 1. 产品定位

Agentic Research Workspace 是一个面向 AI/ML 科研人员的人机协同科研工作台。它通过多 Agent 协作，把选题、文献调研、idea 生成、代码实现、实验运行、结果分析和论文素材沉淀组织成可观察、可干预、可追溯的科研闭环。

产品目标不是承诺完全自动发表顶会论文，而是提升科研过程中的实验探索效率、知识沉淀效率和复现实验能力。

一句话定位：

> 用 Agent 自动化处理科研中的重复执行、实验管理和结果整理，让研究者把精力集中在判断研究价值和做关键决策上。

## 2. 目标用户

| 用户角色 | 典型诉求 | 关键价值 |
| --- | --- | --- |
| AI/ML 研究生 | 快速尝试 idea、复现实验、整理结果 | 缩短从想法到实验结果的时间 |
| 算法工程师 | 在已有代码库上快速做 baseline、ablation、调参 | 自动执行实验和记录配置 |
| PI / 研究负责人 | 了解多个研究方向进展、判断 idea 质量 | 可视化任务状态和实验证据 |
| 独立研究者 | 没有完整团队时完成端到端科研流程 | 获得科研流程协同能力 |

## 3. 用户痛点

1. Idea、论文、代码、实验结果分散，长期沉淀困难。
2. 实验过程依赖大量手工操作，容易遗漏配置和日志。
3. 失败实验缺少结构化归因，下一步迭代靠经验猜测。
4. 多 Agent 或 LLM 执行过程不透明，用户无法及时干预。
5. 论文写作时需要重新整理实验、图表和 related work。

## 4. 产品原则

### 4.1 可观察

用户必须能看到 Agent 正在做什么、任务图走到哪里、每个节点输入输出是什么、实验是否还在运行。

### 4.2 可控制

用户必须能暂停、重试、跳过、编辑关键节点。系统不应该把科研决策完全黑盒化。

### 4.3 可追溯

每个 idea、代码变更、实验配置、metrics、日志、结论都要能回溯到来源。

### 4.4 可复现

系统应记录代码版本、数据集版本、运行环境、配置和产物，优先保证实验可复现。

### 4.5 人机协同

Agent 负责批量探索、执行和整理；研究者负责判断价值、设定方向和做最终取舍。

## 5. 不做什么

MVP 阶段明确不做以下事情：

1. 不承诺自动生成可发表顶会论文。
2. 不支持任意领域、任意代码库、任意数据集的完全通用实验自动化。
3. 不做完整 W&B / MLflow 替代品，只做轻量实验追踪和科研闭环需要的结果管理。
4. 不默认执行不可信代码，所有执行环境必须有隔离和权限边界。
5. 不把 LLM 推理内容当作事实证据，重要结论必须绑定论文、实验或用户确认。

## 6. 核心用户流程

### 6.1 创建研究任务

用户输入研究目标，例如：

```text
我想围绕 3D reconstruction 找一个适合 CVPR 投稿的方向，并先跑一个最小实验验证。
```

系统产出：

1. Research Task
2. 初始 Task Graph
3. 候选研究方向
4. 推荐的实验路径

### 6.2 选择或编辑 idea

系统生成多个 candidate ideas，用户可以选择、合并或手动修改。每个 idea 都需要包含 hypothesis、motivation、method sketch、expected evidence。

### 6.3 生成实现方案

Coding Agent 基于模板 repo 或用户指定 repo 生成代码修改计划，用户确认后进入执行。

### 6.4 自动运行实验

Experiment Agent 根据配置启动实验，记录配置、日志、metrics、代码版本和产物。

### 6.5 分析并迭代

Evaluation Agent 结合 baseline、metrics、logs 和失败信息生成结论，并建议下一轮迭代方向。

### 6.6 沉淀论文素材

系统把有效 idea、实验结论、图表、表格和 related work 汇总到 Paper Editor，作为后续论文写作素材。
并产出一份 Latex 格式的论文初稿

## 7. MVP 范围

### 7.1 MVP 目标

做出一个可演示、可真实运行的最小科研闭环：

```text
Goal -> Task Graph -> Idea -> Code Plan -> Experiment -> Evaluation -> Next Iteration
```

### 7.2 P0 功能

| 功能 | 说明 | 子文档 |
| --- | --- | --- |
| Research Task Dashboard | 创建任务、查看任务列表和整体状态 | [modules/01-research-task-dashboard.md](modules/01-research-task-dashboard.md) |
| Task Graph | 展示 DAG、节点状态、节点输入输出 | [modules/02-task-graph.md](modules/02-task-graph.md) |
| Agent Console | 查看 Agent 执行记录、日志、输入输出 | [modules/03-agent-console.md](modules/03-agent-console.md) |
| Idea Workspace | 生成、编辑、版本化管理 idea | [modules/05-idea-workspace.md](modules/05-idea-workspace.md) |
| Coding Workspace | 生成代码计划、展示 diff、触发实现 | [modules/06-coding-workspace.md](modules/06-coding-workspace.md) |
| Experiment Workspace | 运行实验、记录 config、metrics、logs | [modules/07-experiment-workspace.md](modules/07-experiment-workspace.md) |
| Evaluation & Iteration | 分析结果、生成下一步行动 | [modules/08-evaluation-iteration.md](modules/08-evaluation-iteration.md) |
| Memory Explorer | 查询论文、idea、实验和日志记录 | [modules/09-memory-explorer.md](modules/09-memory-explorer.md) |
| Agent Orchestrator | 负责任务编排、状态推进和工具调用 | [modules/11-agent-orchestrator.md](modules/11-agent-orchestrator.md) |

### 7.3 P1 功能

| 功能 | 说明 | 子文档 |
| --- | --- | --- |
| Research Intake | 论文检索、PDF 解析、related work 汇总 | [modules/04-research-intake.md](modules/04-research-intake.md) |
| Paper Editor | 论文草稿、图表、表格、LaTeX 管理 | [modules/10-paper-editor.md](modules/10-paper-editor.md) |
| Reviewer Simulator | 模拟审稿意见，辅助提前发现风险 | [modules/12-reviewer-simulator.md](modules/12-reviewer-simulator.md) |

### 7.4 P2 功能

| 功能 | 说明 | 子文档 |
| --- | --- | --- |
| SOTA Tracker | 追踪最新论文、leaderboard 和 benchmark | [modules/13-sota-tracker.md](modules/13-sota-tracker.md) |
| Failure Analysis | 深入分析失败实验原因和修复建议 | [modules/14-failure-analysis.md](modules/14-failure-analysis.md) |

## 8. MVP 验收标准

1. 用户可以创建一个 research task，并看到可视化 Task Graph。
2. 系统至少能完成一次真实的 Idea -> Experiment -> Evaluation 闭环。
3. 每个 Agent 节点都有可查看的输入、输出、状态和日志。
4. 实验必须保存 config、metrics、logs、artifact、代码版本。
5. 用户可以对 idea、实验配置或失败节点进行人工干预。
6. 系统可以基于实验结果生成下一轮迭代建议。
7. 任务结束后，用户可以导出一份结构化研究总结。

## 9. 系统架构

```text
Frontend
  React / Next.js
  React Flow
  Charts
        |
Backend API
  FastAPI
  REST + WebSocket
        |
Agent Orchestrator
  LangGraph
  Agent State Machine
        |
Tool Layer
  LLM
  Paper Search
  Git Repo
  GPU Runner
  Vector DB
  Experiment Tracker
        |
Storage
  Relational DB
  Object Storage
  Vector Store
```

## 10. 核心数据对象

### 10.1 ResearchTask

```json
{
  "id": "task_001",
  "goal": "Generate and test a CVPR-level idea for 3D reconstruction",
  "status": "running",
  "domain": "computer_vision",
  "created_by": "user_001",
  "created_at": "2026-05-11T10:00:00Z"
}
```

### 10.2 TaskNode

```json
{
  "id": "node_idea_001",
  "task_id": "task_001",
  "type": "idea_generation",
  "status": "done",
  "input_ref": "artifact_input_001",
  "output_ref": "artifact_output_001",
  "depends_on": ["node_research_001"]
}
```

### 10.3 Idea

```json
{
  "id": "idea_001",
  "task_id": "task_001",
  "parent_id": null,
  "hypothesis": "...",
  "method_sketch": "...",
  "expected_evidence": ["metric improvement", "ablation result"],
  "status": "selected"
}
```

### 10.4 Experiment

```json
{
  "id": "exp_001",
  "task_id": "task_001",
  "idea_id": "idea_001",
  "code_version": "git_sha",
  "config": {},
  "metrics": {},
  "logs_ref": "logs/exp_001.txt",
  "status": "completed"
}
```

### 10.5 AgentRun

```json
{
  "id": "run_001",
  "agent_type": "experiment",
  "task_id": "task_001",
  "node_id": "node_experiment_001",
  "status": "done",
  "input": {},
  "output": {},
  "artifacts": []
}
```

## 11. 核心接口草案

### 11.1 创建任务

```http
POST /api/tasks
```

```json
{
  "goal": "Generate a CVPR idea on 3D reconstruction",
  "domain": "computer_vision",
  "constraints": {
    "max_gpu_hours": 8,
    "target_benchmark": "TBD"
  }
}
```

### 11.2 获取任务状态

```http
GET /api/tasks/{task_id}
```

### 11.3 获取 Task Graph

```http
GET /api/tasks/{task_id}/graph
```

### 11.4 人工干预节点

```http
POST /api/tasks/{task_id}/nodes/{node_id}/interventions
```

```json
{
  "action": "modify_input",
  "content": {
    "idea": "new idea content"
  }
}
```

### 11.5 启动实验

```http
POST /api/experiments
```

### 11.6 实时事件流

```http
GET /api/tasks/{task_id}/events
```

事件类型：

```text
task.created
node.started
node.log
node.completed
node.failed
experiment.metric
artifact.created
intervention.required
```

## 12. 技术选型建议

| 层级 | 推荐方案 |
| --- | --- |
| 前端 | React + Next.js |
| UI | Tailwind CSS + shadcn/ui |
| Task Graph | React Flow |
| 图表 | Recharts 或 ECharts |
| 后端 | FastAPI |
| 实时通信 | WebSocket 或 Server-Sent Events |
| Agent 编排 | LangGraph |
| RAG | LlamaIndex 或 Haystack |
| 向量库 | FAISS 起步，后续 Weaviate / Milvus |
| 实验管理 | MLflow 起步，兼容 W&B |
| 执行环境 | Docker + Linux + GPU Runner |

## 13. Roadmap

### 13.1 Phase 0: 原型验证

目标：验证科研闭环是否成立。

交付：

1. 静态 Task Graph 原型
2. Idea Workspace 原型
3. 手动触发的实验记录页面
4. 简单 Evaluation 输出

### 13.2 Phase 1: MVP

目标：完成真实可运行的 Idea -> Code -> Experiment -> Evaluation 闭环。

交付：

1. Agent Orchestrator
2. 真实实验执行
3. 实验配置和日志沉淀
4. 用户可干预节点
5. 结构化研究总结导出

### 13.3 Phase 2: Beta

目标：增强论文阅读、RAG 和论文素材生成能力。

交付：

1. Research Intake
2. Paper Memory
3. Paper Editor
4. Reviewer Simulator 初版

### 13.4 Phase 3: 完整工作台

目标：支持更完整的科研项目管理和长期知识沉淀。

交付：

1. SOTA Tracker
2. Failure Analysis
3. 多任务对比
4. 团队协作能力

## 14. 风险与限制

| 风险 | 说明 | 缓解方式 |
| --- | --- | --- |
| Idea novelty 不稳定 | LLM 生成的 idea 可能只是组合已有方法 | 绑定论文证据、Reviewer Simulator、人类确认 |
| 实验成本高 | GPU 实验耗时耗钱 | 配额、预算限制、优先小实验 |
| 代码执行风险 | Agent 修改和运行代码存在安全风险 | Docker 隔离、权限限制、人工确认 |
| 结果不可复现 | 配置和环境缺失会影响复现 | 强制记录 config、git sha、环境信息 |
| Agent 幻觉 | 论文总结或实验结论可能不可靠 | 引用来源、实验证据、置信度标记 |

## 15. 成功指标

| 指标 | MVP 目标 |
| --- | --- |
| Time to First Experiment | 从创建任务到首个实验启动小于 30 分钟 |
| Experiment Trace Completeness | 95% 实验记录包含 config、metrics、logs、code_version |
| Intervention Coverage | 用户能对 P0 节点执行暂停、重试、修改输入 |
| Research Summary Quality | 每次任务结束生成结构化总结 |
| Reproducibility | 已完成实验可通过记录信息重新运行 |


## UI参考图
C:\Users\hongyuanzhu\Code\AgenticResearch\docs\ChatGPT Image May 11, 2026, 06_50_33 PM.png

