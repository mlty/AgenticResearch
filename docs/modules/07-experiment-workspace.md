# Experiment Workspace 模块文档

## 1. 模块定位

Experiment Workspace 负责实验启动、配置管理、日志记录、metrics 展示和实验对比。它是产品的核心能力之一。

## 2. 用户价值

1. 自动运行实验，减少手工命令和配置错误。
2. 保存实验证据，支持复现和对比。
3. 快速判断 idea 是否值得继续投入。

## 3. 用户故事

```text
作为研究者，我希望每次实验都自动记录配置、日志和结果，以便之后可以复现并对比不同 idea。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 创建实验。
- [ ] 编辑或确认实验配置。
- [ ] 启动实验运行。
- [ ] 实时展示日志和核心 metrics。
- [ ] 保存 config、metrics、logs、artifact、code_version。
- [ ] 支持实验失败后的重试。

### 4.2 暂不做

- [ ] 大规模分布式训练调度。
- [ ] 完整 Bayesian tuning 平台。
- [ ] 替代 W&B 的全部功能。

## 5. 页面与交互

核心视图：

1. 实验列表。
2. 实验详情。
3. 配置查看和编辑。
4. metrics 曲线。
5. 日志流。
6. artifact 下载或预览。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| Experiment | 实验主对象 |
| ExperimentConfig | 配置 |
| MetricSeries | 指标曲线 |
| ExperimentLog | 日志 |
| Artifact | 模型、图表、结果文件 |
| RunnerJob | 执行任务 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/experiments` | 创建实验 |
| API | `POST /api/experiments/{experiment_id}/run` | 启动实验 |
| API | `GET /api/experiments/{experiment_id}` | 获取实验详情 |
| API | `GET /api/experiments/{experiment_id}/metrics` | 获取指标 |
| Event | `experiment.started` | 实验启动 |
| Event | `experiment.metric` | 指标更新 |
| Event | `experiment.completed` | 实验完成 |
| Event | `experiment.failed` | 实验失败 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Pending resources | 展示排队原因 |
| Running | 展示实时日志和 metrics |
| Failed | 展示失败摘要、日志位置和重试入口 |
| Completed | 展示结果摘要和下一步分析入口 |
| Budget exceeded | 停止运行并提示用户确认 |

## 9. 验收标准

- [ ] 用户可以启动一个实验。
- [ ] 实验运行过程有日志和状态更新。
- [ ] 实验结束后能看到 metrics。
- [ ] 实验记录包含复现所需的关键字段。

## 10. 待细化问题

- [ ] 首版 Runner 是本地 Docker、远程 SSH 还是云 GPU？
- [ ] metrics 格式如何统一？
- [ ] 是否直接集成 MLflow？
