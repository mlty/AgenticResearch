# Agent Orchestrator 模块文档

## 1. 模块定位

Agent Orchestrator 负责任务拆解、Agent 调度、状态推进、工具调用和事件流输出。它是后端核心能力。

## 2. 用户价值

1. 把复杂科研流程拆成可追踪节点。
2. 让不同 Agent 按依赖顺序协作。
3. 为前端提供一致的状态和事件。

## 3. 用户故事

```text
作为用户，我希望系统能自动把研究目标拆成可执行任务，并在每一步需要我确认时提醒我。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 接收 ResearchTask。
- [ ] 生成初始 Task Graph。
- [ ] 调度 AgentRun。
- [ ] 管理节点状态。
- [ ] 发出事件流。
- [ ] 支持人工干预后继续执行。

### 4.2 暂不做

- [ ] 高级多 Agent debate。
- [ ] 复杂资源优化调度。
- [ ] 跨团队大规模并发工作流。

## 5. 编排模型

建议使用 LangGraph 管理状态机。

基础流程：

```text
Planner -> Research -> Idea -> Coding -> Experiment -> Evaluation -> Iteration
```

节点需要支持：

1. 输入 schema。
2. 输出 schema。
3. retry policy。
4. timeout。
5. intervention required。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| TaskGraph | 工作流定义 |
| TaskNode | 节点状态 |
| AgentRun | 单次 Agent 运行 |
| ToolCall | 工具调用 |
| Event | 事件流 |
| Intervention | 人工干预 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/tasks/{task_id}/plan` | 生成计划 |
| API | `POST /api/tasks/{task_id}/run` | 启动执行 |
| API | `POST /api/tasks/{task_id}/pause` | 暂停任务 |
| API | `POST /api/tasks/{task_id}/resume` | 继续任务 |
| Event | `node.state_changed` | 节点状态变化 |
| Event | `intervention.required` | 需要用户干预 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Agent timeout | 进入 failed 或 blocked |
| Tool unavailable | 尝试降级或要求用户配置 |
| Invalid output | 触发 schema validation failed |
| User intervention | 暂停相关下游节点 |

## 9. 验收标准

- [ ] Orchestrator 能创建 Task Graph。
- [ ] 节点能按依赖关系执行。
- [ ] 前端能收到节点状态事件。
- [ ] 用户干预后流程可以继续。

## 10. 待细化问题

- [ ] Agent output schema 如何版本化？
- [ ] retry policy 默认值是什么？
- [ ] 哪些节点必须人工确认？
