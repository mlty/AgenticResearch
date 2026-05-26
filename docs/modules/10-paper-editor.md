# Paper Editor 模块文档

## 1. 模块定位

Paper Editor 用于把研究过程中的 idea、related work、实验结果、图表和结论沉淀为论文草稿或 LaTeX 项目。

## 2. 用户价值

1. 减少论文写作前的资料整理成本。
2. 保证论文中的实验数据可追溯。
3. 帮助用户快速形成 abstract、method、experiment 等初稿。

## 3. 用户故事

```text
作为研究者，我希望实验完成后系统自动整理表格和结论，以便我可以更快开始写论文。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 根据任务生成结构化研究总结。
- [ ] 生成论文大纲。
- [ ] 自动插入已确认的实验结果和图表。
- [ ] 导出 Markdown 或 LaTeX 草稿。

### 4.2 暂不做

- [ ] 完整在线 LaTeX 协作编辑器。
- [ ] 自动投稿系统。
- [ ] 自动保证论文被接收。

## 5. 页面与交互

核心视图：

1. 论文大纲。
2. 分章节编辑器。
3. 实验表格和图表引用面板。
4. related work 引用面板。
5. 导出入口。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| PaperDraft | 论文草稿 |
| PaperSection | 章节 |
| Citation | 引用 |
| Figure | 图 |
| Table | 表格 |
| Experiment | 实验数据来源 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/tasks/{task_id}/paper-draft` | 生成草稿 |
| API | `PATCH /api/paper-drafts/{draft_id}` | 更新草稿 |
| API | `POST /api/paper-drafts/{draft_id}/export` | 导出 |
| Event | `paper.draft_created` | 草稿生成 |
| Event | `paper.exported` | 导出完成 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Missing experiment | 提示缺少实验支持 |
| Citation missing | 标记需要补充引用 |
| Export failed | 展示 LaTeX 编译错误或格式错误 |
| Draft outdated | 提醒有新实验未同步 |

## 9. 验收标准

- [ ] 用户可以生成论文大纲。
- [ ] 用户可以导出 Markdown 或 LaTeX 草稿。
- [ ] 草稿中的实验结论能追溯到实验记录。
- [ ] 用户能手动编辑章节内容。

## 10. 待细化问题

- [ ] 首版导出 Markdown 还是 LaTeX？
- [ ] 是否内置 CVPR / NeurIPS 模板？
- [ ] 图表生成和论文编辑的边界如何划分？
