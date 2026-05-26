# Agent Console 模块文档

## 1. 模块定位

Agent Console 用于展示每个 Agent 的运行输入、输出、日志、工具调用和错误信息，是系统调试和可观察性的核心模块。

## 2. 用户价值

1. 让用户理解 Agent 为什么做出某个动作。
2. 快速定位失败节点的原因。
3. 支持研究者在关键节点介入。

## 3. 用户故事

```text
作为算法工程师，我希望查看 Coding Agent 的执行日志和代码修改计划，以便确认它没有偏离我的实验目标。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 按 AgentRun 展示输入和输出。
- [ ] 展示日志流。
- [ ] 展示工具调用摘要。
- [ ] 展示错误和堆栈摘要。
- [ ] 支持用户输入 intervention。

### 4.2 暂不做

- [ ] 完整复刻 terminal。
- [ ] 展示全部模型推理链路。
- [ ] 多用户实时协作评论。

## 5. 页面与交互

核心视图：

1. Agent 列表或标签页。
2. 当前 AgentRun 时间线。
3. 输入输出 JSON/Markdown 查看器。
4. 日志流。
5. 人工干预输入框。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| AgentRun | 运行记录 |
| AgentMessage | Agent 消息 |
| ToolCall | 工具调用记录 |
| Intervention | 用户干预 |
| Artifact | 输出产物 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `GET /api/agent-runs/{run_id}` | 获取运行详情 |
| API | `GET /api/agent-runs/{run_id}/logs` | 获取日志 |
| API | `POST /api/agent-runs/{run_id}/interventions` | 提交干预 |
| Event | `agent.message` | Agent 消息 |
| Event | `agent.tool_call` | 工具调用 |
| Event | `agent.error` | Agent 错误 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Log streaming | 自动滚动并允许暂停滚动 |
| Tool timeout | 标记超时并提供重试入口 |
| Permission required | 提示用户授权或修改配置 |
| Output too large | 自动折叠并支持下载 artifact |

## 9. 验收标准

- [ ] 用户能看到 Agent 的输入和输出。
- [ ] 用户能追踪 Agent 执行进度。
- [ ] 失败时能看到明确错误摘要。
- [ ] 用户能从 Console 提交一次人工干预。

## 10. 待细化问题

- [ ] 哪些工具调用需要对用户隐藏敏感参数？
- [ ] 日志保留多久？
- [ ] Agent reasoning 摘要如何展示才可信且不误导？
