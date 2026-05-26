# Coding Workspace 模块文档

## 1. 模块定位

Coding Workspace 负责把选中的 idea 转换为代码修改计划、配置文件和可运行实验入口。它是 idea 和实验之间的桥梁。

## 2. 用户价值

1. 降低从 idea 到代码实现的手工成本。
2. 在执行前让用户审查代码修改计划。
3. 保证实验代码和配置可追溯。

## 3. 用户故事

```text
作为算法工程师，我希望 Agent 先给出代码修改计划和 diff，再真正修改 repo，以便我控制实验实现风险。
```

## 4. MVP 功能范围

### 4.1 必须做

- [ ] 读取目标 repo 结构。
- [ ] 生成实现计划。
- [ ] 生成或修改训练配置。
- [ ] 展示代码 diff。
- [ ] 记录代码版本和执行命令。

### 4.2 暂不做

- [ ] 完全支持任意大型代码库。
- [ ] 自动重构复杂工程。
- [ ] 无需人工确认直接修改关键代码。

## 5. 页面与交互

核心视图：

1. 实现计划。
2. 文件变更列表。
3. diff 查看器。
4. 配置编辑器。
5. 执行命令预览。
6. 确认实现或要求重写。
7. 服务器连接、远程命令、流式 stdout/stderr 和自动修复草案只在 Coding Tab 内展示。

交互边界：

- Coding Tab 内的连接、安装、修复和命令执行不自动切换到 Experiment / Evaluation / Paper 页面。
- Coding plan 只更新 Coding 节点，不直接改写 Experiment 节点状态。
- 远程 Live 刷新只在 Coding Tab 可见时运行。
- 与服务器流式交互/显示只保留两个区域：左栏 `Remote coding chat` 作为指令入口，右栏 `Streaming output` 作为 stdout/stderr 输出面板。
- `Streaming output` 顶部保留圆形进度条，按 guard、Deep Search、硬件探测、repo 准备、Plan、conda env 创建、Do、依赖安装、React、Verify 等日志阶段估算当前执行进度。

## 6. 数据对象

| 对象 | 用途 |
| --- | --- |
| CodePlan | 代码实现计划 |
| CodeChange | 文件修改记录 |
| ExperimentConfig | 实验配置 |
| RepoSnapshot | repo 状态 |
| Artifact | 生成的代码或配置 |

## 7. API / 事件

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| API | `POST /api/ideas/{idea_id}/code-plan` | 生成代码计划 |
| API | `POST /api/code-changes/{change_id}/apply` | 应用代码变更 |
| API | `GET /api/repos/{repo_id}/status` | 获取 repo 状态 |
| Event | `code.plan_created` | 代码计划生成 |
| Event | `code.change_applied` | 代码变更应用 |

## 8. 状态与异常

| 状态 | 处理方式 |
| --- | --- |
| Dirty repo | 提醒用户存在未提交变更 |
| Apply failed | 展示冲突文件和修复建议 |
| Test failed | 链接到日志和失败命令 |
| Permission denied | 提示 repo 权限不足 |

## 9. 验收标准

- [ ] 用户能看到实现计划。
- [ ] 用户能审查 diff。
- [ ] 代码变更能绑定 idea 和 experiment。
- [ ] 实验配置能被 Experiment Workspace 直接使用。

## 10. 待细化问题

- [ ] 首版是否只支持模板 repo？
- [ ] 是否需要强制创建 git branch？
- [ ] 代码执行前需要哪些安全检查？

## 细化需求--------------------------------------------------------------------

实验环境自动化配置--->

[1] 实时记录安装进度
→ 实时 stdout streaming
1) 获取硬件环境（比如 Python + CUDA + PyTorch）
2）基于 git 文档和 LLM multi-agent planner，进行环境的安装
3）可以通过requirements.txt 管理，可重复使用
4）使用虚拟 multi-agent 协作：Search Agent 深度搜索 README、docs、setup.sh --help、environment.yml、requirements.txt、pyproject.toml、setup.py；Planner Agent 判断安装策略；Executor Agent 执行安全命令；React Agent 基于错误调整；Verifier Agent 做验收
5）在 Coding space 内创建新的 conda env，例如 `agentic-trellis`，并在该 env 内执行安装配置
6）Safe install 请求先由 LLM 输出结构化计划，然后自动执行该计划；失败后进入 Auto repair loop
7）安装结束后执行 `pip check`、Python/PyTorch/CUDA 探测和 entrypoint 搜索
8）通过圆形进度条展示阶段估算进度，避免用户不知道当前处于哪个过程
9）如果只创建了空 conda env，但没有执行项目依赖安装，或 `torch` / `numpy` 等核心依赖缺失，必须标记为 `Environment NOT ready`，不能提示 ready

[2] 安全执行 shell
1）流式输出

[3] 遇到错误
→ 捕获 stderr

[4] 自动解决
→ LLM multi-agent plan + do + react + verify
1）让 LLM 做：

输入：
- 当前命令
- 错误日志

输出：
- 诊断分析
- 失败类型，例如 `missing_conda_env`、`dependency_import_missing`、`setup_script_failed`
- multi-agent plan
- deep search plan
- verify checklist
- 修复命令
- 继续安全执行
2）Auto repair mode 开启时，最多自动重试 3 次；每轮修复后自动 verify，成功即停止
3）Auto repair mode 关闭时，修复命令只生成草案，必须由用户确认后执行
4）修复命令仍然经过服务端安全护栏校验


[5] 继续安装
→ retry

[6] 安装完毕
→ verify()

[7] 通知用户
→ “环境 ready”

##----安全护栏设计-----------------------------------------------
禁止 root
文件隔离，只在本space操作
禁止 sudo / su / doas
禁止 apt/yum/dnf/pacman/brew install 等系统包管理器
禁止 systemctl/service/reboot/shutdown 等系统级操作
禁止读取私钥、密码、token、`/etc/shadow` 等敏感文件
危险删除命令会在服务端被拒绝
