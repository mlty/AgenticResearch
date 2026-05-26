# Task Graph 模块文档

## 1. 模块定位

Task Graph 是 Agentic Research Workspace 的中枢 UI，用于展示研究任务被拆解后的 DAG、每个节点的执行状态，以及节点之间的依赖关系。

## 2. 用户价值

1. 看清系统计划如何完成研究任务。
2. 追踪每个 Agent 节点的状态。
3. 对失败、等待确认或需要修改的节点进行干预。

## 3. 用户故事

```text
作为研究者，我希望看到完整任务图，以便知道 Agent 当前在做什么、下一步会做什么。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 展示 DAG 节点和依赖边。
- [ ] 支持节点状态：pending、running、done、failed、blocked、skipped。
- [ ] 点击节点查看输入、输出、日志和 artifact。
- [ ] 支持对节点执行 retry、pause、skip、edit input。
- [ ] 支持从 Planner Agent 初始化 Task Graph。

### 4.2 暂不做

- [ ] 用户自由拖拽编辑完整 DAG。
- [ ] 多任务图合并。
- [ ] 高级调度策略可视化。

## 5. 页面与交互

推荐使用 React Flow 实现。

核心布局：

1. 中央 Task Graph 画布。
2. 右侧节点详情面板。
3. 顶部任务状态和运行控制。
4. 底部事件日志折叠区。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| TaskGraph | 图结构 |
| TaskNode | 节点信息 |
| TaskEdge | 节点依赖 |
| AgentRun | 节点执行记录 |
| Artifact | 节点产物 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `GET /api/tasks/{task_id}/graph` | 获取任务图 |
| API | `POST /api/tasks/{task_id}/nodes/{node_id}/actions` | 节点操作 |
| Event | `node.started` | 节点开始运行 |
| Event | `node.completed` | 节点完成 |
| Event | `node.failed` | 节点失败 |
| Event | `artifact.created` | 产物生成 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Graph empty | 展示 Planner 初始化入口 |
| Node failed | 展示错误、日志、重试入口 |
| Node blocked | 展示需要用户确认的原因 |
| Graph stale | 提示正在同步最新状态 |

## 9. 验收标准

- [ ] 用户能看懂任务当前进展。
- [ ] 每个节点能打开详情。
- [ ] 节点状态和后台执行状态一致。
- [ ] 用户可以对失败节点发起 retry。

## 10. 待细化问题

- [ ] Task Graph 是否允许用户修改节点顺序？
- [ ] 节点详情里是否展示 Agent reasoning 摘要？
- [ ] 大型任务图如何折叠和分组？
