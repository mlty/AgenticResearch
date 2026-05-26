# Idea Workspace 模块文档

## 1. 模块定位

Idea Workspace 用于生成、编辑、比较和版本化管理研究 idea。它连接 Research Intake、Experiment Workspace 和 Evaluation & Iteration。

## 2. 用户价值

1. 把模糊想法结构化为可验证假设。
2. 记录 idea 的演化过程。
3. 将实验结果反向绑定到 idea，形成证据链。

## 3. 用户故事

```text
作为研究者，我希望比较多个候选 idea 的新颖性、实现成本和验证路径，以便选择最值得先跑实验的方向。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 生成多个 candidate ideas。
- [ ] 支持用户编辑 idea。
- [ ] 记录 idea 版本。
- [ ] 为 idea 绑定论文证据和实验结果。
- [ ] 标记 idea 状态：candidate、selected、tested、rejected、promising。

### 4.2 暂不做

- [ ] 自动保证顶会级 novelty。
- [ ] 复杂多人评审流程。
- [ ] 完整专利或查重系统。

## 5. 页面与交互

核心视图：

1. 候选 idea 列表。
2. 当前 idea 编辑器。
3. hypothesis、method sketch、expected evidence 字段。
4. 版本历史和 diff。
5. 触发下一步：生成代码计划或重新优化。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| Idea | 研究想法 |
| IdeaVersion | 版本历史 |
| Evidence | 论文或实验依据 |
| ResearchGap | idea 来源 |
| Experiment | 验证结果 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/tasks/{task_id}/ideas/generate` | 生成候选 idea |
| API | `PATCH /api/ideas/{idea_id}` | 编辑 idea |
| API | `POST /api/ideas/{idea_id}/select` | 选择 idea |
| Event | `idea.generated` | idea 生成完成 |
| Event | `idea.updated` | idea 被修改 |
| Event | `idea.selected` | idea 被选中 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| No idea | 展示生成入口 |
| Low confidence | 标记缺少证据 |
| Conflict evidence | 提示存在相反论文或实验结果 |
| Version conflict | 保留用户修改并提示合并 |

## 9. 验收标准

- [ ] 系统能生成至少 3 个候选 idea。
- [ ] 用户可以编辑并保存 idea。
- [ ] idea 有明确 hypothesis 和验证方式。
- [ ] idea 能绑定到后续实验。

## 10. 待细化问题

- [ ] idea 评分维度是否包括 novelty、feasibility、risk、cost？
- [ ] 用户修改 idea 后是否自动重新生成 Task Graph？
- [ ] 如何防止 idea 只是在已有论文上做浅层组合？
