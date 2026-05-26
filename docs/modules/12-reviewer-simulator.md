# Reviewer Simulator 模块文档

## 1. 模块定位

Reviewer Simulator 用于模拟审稿人视角，对 idea、实验设计和论文草稿提出质疑，帮助用户提前发现 novelty、实验充分性和表达问题。

## 2. 用户价值

1. 提前暴露研究薄弱点。
2. 帮助设计更有说服力的 ablation。
3. 辅助论文写作阶段的风险检查。

## 3. 用户故事

```text
作为研究者，我希望系统像审稿人一样批评我的方法和实验，以便我在投稿前补强证据。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 对 idea 生成审稿风险摘要。
- [ ] 对实验结果提出 missing ablation。
- [ ] 对论文草稿生成优缺点和问题清单。
- [ ] 输出可执行修改建议。

### 4.2 暂不做

- [ ] 模拟真实审稿分数分布。
- [ ] 预测接收概率。
- [ ] 替代真实同行评审。

## 5. 页面与交互

核心视图：

1. 选择评审对象：idea、experiment、paper draft。
2. 选择评审风格：strict、balanced、supportive。
3. 风险列表。
4. 建议行动。
5. 一键创建补充实验或修改任务。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| ReviewRequest | 评审请求 |
| ReviewReport | 评审报告 |
| ReviewIssue | 问题项 |
| NextAction | 修改建议 |
| Evidence | 关联证据 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/reviews` | 创建模拟评审 |
| API | `GET /api/reviews/{review_id}` | 获取评审结果 |
| Event | `review.completed` | 评审完成 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Insufficient evidence | 标记评审置信度低 |
| Draft too incomplete | 建议先补充章节 |
| Conflicting review | 展示不同视角而不是合并成单一结论 |

## 9. 验收标准

- [ ] 系统能输出结构化审稿意见。
- [ ] 每条意见能对应到 idea、实验或论文段落。
- [ ] 用户能把审稿建议转成下一步任务。

## 10. 待细化问题

- [ ] 是否需要模拟 Area Chair 视角？
- [ ] 审稿标准是否按 CVPR / NeurIPS 区分？
- [ ] 如何避免生成过度主观的否定意见？
