# Evaluation & Iteration 模块文档

## 1. 模块定位

Evaluation & Iteration 负责分析实验结果、对比 baseline、提取结论，并生成下一轮 idea 或实验建议。

## 2. 用户价值

1. 从实验结果中提取有效 insight。
2. 明确下一步是继续、修改、扩大实验还是放弃。
3. 把失败实验转化为可积累的研究经验。

## 3. 用户故事

```text
作为研究者，我希望系统根据 metrics 和日志总结实验是否有效，以便决定下一轮应该改模型、改 loss 还是补 ablation。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 总结实验结果。
- [ ] 对比 baseline 或上一次实验。
- [ ] 判断 improvement 是否成立。
- [ ] 生成下一步建议。
- [ ] 把 conclusion 写入 Idea Memory 和 Experiment Memory。

### 4.2 暂不做

- [ ] 自动证明 novelty。
- [ ] 自动完成所有 ablation 设计。
- [ ] 复杂统计显著性分析。

## 5. 页面与交互

核心视图：

1. 实验结果摘要。
2. baseline 对比。
3. insight 列表。
4. 下一步建议。
5. 一键创建下一轮 idea 或实验。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| EvaluationReport | 分析报告 |
| ExperimentComparison | 实验对比 |
| Insight | 结论 |
| NextAction | 下一步动作 |
| IdeaVersion | idea 迭代版本 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/experiments/{experiment_id}/evaluate` | 分析实验 |
| API | `POST /api/evaluations/{evaluation_id}/next-actions` | 生成下一步 |
| API | `POST /api/ideas/{idea_id}/refine` | 迭代 idea |
| Event | `evaluation.completed` | 分析完成 |
| Event | `iteration.created` | 迭代建议生成 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Missing baseline | 标记结论置信度较低 |
| Incomplete metrics | 提示需要补跑实验 |
| Conflicting results | 要求用户确认解释 |
| Failed analysis | 允许重新分析或人工填写结论 |

## 9. 验收标准

- [ ] 每个完成实验都能生成 EvaluationReport。
- [ ] 报告明确说明是否改进。
- [ ] 报告给出下一步行动建议。
- [ ] 用户可以基于建议创建下一轮实验。

## 10. 待细化问题

- [ ] 什么条件下判断 improvement 成立？
- [ ] 是否引入统计显著性阈值？
- [ ] 下一步建议是否需要用户确认后才进入 Task Graph？
