# Memory Explorer 模块文档

## 1. 模块定位

Memory Explorer 用于检索和管理系统沉淀的论文、idea、实验、日志、结论和 artifact，是可追溯性的核心入口。

## 2. 用户价值

1. 快速找回历史研究素材。
2. 追溯某个结论来自哪篇论文或哪次实验。
3. 支持跨任务复用经验。

## 3. 用户故事

```text
作为研究者，我希望搜索过去失败过的实验和原因，以便避免重复踩坑。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 检索 Paper Memory。
- [ ] 检索 Idea Memory。
- [ ] 检索 Experiment Memory。
- [ ] 展示 artifact 引用。
- [ ] 支持按 task、type、date、status 过滤。

### 4.2 暂不做

- [ ] 复杂知识图谱可视化。
- [ ] 自动跨项目知识迁移。
- [ ] 企业级权限审计。

## 5. 页面与交互

核心视图：

1. 全局搜索框。
2. 类型筛选。
3. 搜索结果列表。
4. 结果详情。
5. 引用链路：paper -> idea -> experiment -> insight。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| MemoryItem | 通用记忆项 |
| Paper | 论文 |
| Idea | 想法 |
| Experiment | 实验 |
| Insight | 结论 |
| Artifact | 文件产物 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `GET /api/memory/search` | 搜索 memory |
| API | `GET /api/memory/items/{item_id}` | 获取详情 |
| API | `POST /api/memory/items` | 写入 memory |
| Event | `memory.item_created` | memory 写入 |
| Event | `memory.item_updated` | memory 更新 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| No results | 提供搜索建议 |
| Vector index stale | 提示索引更新中 |
| Broken artifact link | 标记 artifact 缺失 |
| Permission denied | 隐藏无权限内容 |

## 9. 验收标准

- [ ] 用户能搜索到已保存论文。
- [ ] 用户能搜索到历史实验。
- [ ] 用户能从 insight 追溯到对应 experiment。
- [ ] 用户能从 experiment 追溯到 idea。

## 10. 待细化问题

- [ ] Memory 是否需要手动收藏和置顶？
- [ ] Memory item 的删除策略是什么？
- [ ] 向量检索和关键词检索如何组合？
