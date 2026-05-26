# SOTA Tracker 模块文档

## 1. 模块定位

SOTA Tracker 用于持续追踪指定研究方向的新论文、benchmark、leaderboard 和关键指标变化，帮助用户判断 idea 是否仍然有竞争力。

## 2. 用户价值

1. 避免重复已经被发表的工作。
2. 及时发现新的 baseline 和评测标准。
3. 为 related work 和实验对比提供更新来源。

## 3. 用户故事

```text
作为研究者，我希望系统提醒我某个方向最近出现了新的 SOTA 方法，以便我及时更新实验对比。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 订阅关键词或任务方向。
- [ ] 定期检索新论文。
- [ ] 标记可能相关的新方法。
- [ ] 提醒用户更新 baseline。

### 4.2 暂不做

- [ ] 自动维护所有 leaderboard。
- [ ] 自动复现所有 SOTA。
- [ ] 覆盖所有学术会议和期刊。

## 5. 页面与交互

核心视图：

1. 订阅列表。
2. 新论文 feed。
3. 与当前 idea 的相关性说明。
4. baseline 更新建议。
5. 添加到 Research Intake 或 Experiment 的入口。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| SotaSubscription | 订阅条件 |
| PaperUpdate | 新论文 |
| Benchmark | benchmark 信息 |
| LeaderboardEntry | 排名和指标 |
| Alert | 提醒 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/sota/subscriptions` | 创建订阅 |
| API | `GET /api/sota/updates` | 获取更新 |
| API | `POST /api/sota/updates/{update_id}/import` | 导入论文 |
| Event | `sota.update_found` | 发现新更新 |
| Event | `sota.alert_created` | 创建提醒 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| No updates | 显示最近检查时间 |
| Source unavailable | 标记来源不可用 |
| Low relevance | 折叠低相关内容 |
| Duplicate update | 合并到已有论文记录 |

## 9. 验收标准

- [ ] 用户能创建方向订阅。
- [ ] 系统能展示新论文更新。
- [ ] 用户能把更新导入 Research Intake。
- [ ] 系统能提示当前实验可能缺少新 baseline。

## 10. 待细化问题

- [ ] 首版数据源选择 arXiv、Papers with Code 还是 Semantic Scholar？
- [ ] 更新频率如何设置？
- [ ] 如何判断一篇论文与当前 idea 强相关？
