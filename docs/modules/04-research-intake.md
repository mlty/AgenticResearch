# Research Intake 模块文档

## 1. 模块定位

Research Intake 负责论文检索、PDF 解析、论文摘要、related work 提取和 research gap 初步整理。它为 Idea Workspace 和 Memory Explorer 提供研究素材。

## 2. 用户价值

1. 快速建立某个方向的论文背景。
2. 自动整理方法、数据集、指标和不足。
3. 为 idea 生成提供可引用证据。

## 3. 用户故事

```text
作为研究生，我希望系统自动阅读一批相关论文并总结 gap，以便更快找到可验证的研究方向。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 根据关键词检索论文。
- [ ] 记录论文 metadata。
- [ ] 解析 PDF 或摘要文本。
- [ ] 提取方法、贡献、限制、数据集、指标。
- [ ] 写入 Paper Memory。

### 4.2 暂不做

- [ ] 完整自动判断论文质量。
- [ ] 自动覆盖所有学术数据库。
- [ ] 复杂 citation graph 分析。

## 5. 页面与交互

核心视图：

1. 搜索输入和筛选条件。
2. 论文列表。
3. 论文详情摘要。
4. Gap / limitation 汇总。
5. 添加到当前任务的操作。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| Paper | 论文 metadata |
| PaperSummary | 论文结构化摘要 |
| Citation | 引用关系 |
| ResearchGap | 提取出的研究空白 |
| MemoryChunk | RAG 检索单元 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/research/search` | 检索论文 |
| API | `POST /api/research/papers/import` | 导入论文 |
| API | `GET /api/research/papers/{paper_id}` | 获取论文详情 |
| Event | `paper.imported` | 论文导入成功 |
| Event | `paper.summarized` | 论文摘要完成 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Search empty | 提示调整关键词 |
| PDF parse failed | 允许用户上传文本或手动补充 |
| Metadata missing | 标记缺失字段 |
| Duplicate paper | 合并或提示已存在 |

## 9. 验收标准

- [ ] 用户可以检索并导入论文。
- [ ] 系统能生成结构化论文摘要。
- [ ] 摘要能进入 Memory Explorer 被检索。
- [ ] Idea 生成时可以引用已导入论文。

## 10. 待细化问题

- [ ] 首版接入 arXiv、Semantic Scholar 还是用户上传？
- [ ] PDF 解析失败时的人工修正流程是什么？
- [ ] 如何标注论文摘要的置信度？
