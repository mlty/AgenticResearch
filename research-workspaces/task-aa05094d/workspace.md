# trelli2 相关的工作

- Task ID: task-aa05094d
- Domain: 视频生成与扩散模型
- Status: running
- Progress: 45%
- Updated: 2026/5/14 14:04:58
- Saved copy: 2026/5/14 14:04:58

## Current Selection

- Idea: SLAT 引导的多视图一致 3D 生成
- Hypothesis: 将 TRELLIS 的 SLAT 编码器作为 3D 结构先验注入多视图扩散模型，可在单图输入下生成几何一致的多视角图像，并提升后续 3D 重建的拓扑正确性
- Method: 1. 从单输入图像用 TRELLIS SLAT VAE 编码出稀疏 3D 隐变量
2. 将 SLAT 特征作为 cross-attention 条件注入多视图扩散模型（如 Zero123++ 架构）
3. 多视图扩散输出送入 LRM/InstantMesh 进行 3D 重建
4. 端到端微调或冻结 SLAT encoder 仅训练 adapter

## Task Graph

### Planner
- Agent: Planner Agent
- Status: done
- Artifact: planner-report-v1
完成 Trellis/Trelli2 相关视频生成领域的文献调研，识别主流技术路线、关键瓶颈和开源资源

### Idea
- Agent: Idea Agent
- Status: done
- Artifact: selected:idea-004
已选择 SLAT 引导的多视图一致 3D 生成。

### Coding
- Agent: Coding Agent
- Status: pending
- Artifact: pending
待选定 idea 后设计代码实现计划

### Experiment
- Agent: Experiment Agent
- Status: pending
- Artifact: pending
待代码就绪后执行实验

### Evaluation
- Agent: Evaluation Agent
- Status: pending
- Artifact: pending
待实验完成后进行评估分析

### Paper
- Agent: Paper Agent
- Status: pending
- Artifact: pending
待评估完成后撰写论文

## Planner Report

## Trellis 相关工作现状报告

### 主流技术路线
当前 3D 生成领域存在三条主流路线：
1. **多视图扩散+重建**：先用 2D 扩散模型生成多视角图像，再用大型重建模型（LRM）或 3DGS 拟合 3D 表示（InstantMesh、LGM、GRM）
2. **3D 原生扩散**：直接在 3D latent 空间训练扩散模型（TRELLIS 的 SLAT、Direct3D 的 triplane、LN3Diff 的神经场）
3. **优化式生成**：利用 2D 扩散先验优化 3D 表示（DreamFusion 的 SDS、DreamGaussian）

TRELLIS 采用第二条路线，其结构化 3D 隐变量（SLAT）统一表示多种输出格式是主要创新点。

### 关键瓶颈
1. **拓扑复杂度**：薄结构、镂空、高频细节生成仍困难
2. **多视图一致性**：两阶段方法受多视图扩散误差累积影响
3. **Mesh 质量**：从隐式表示/Gaussian 提取干净 mesh 仍需改进
4. **训练资源**：大规模 3D 数据集训练需要大量 GPU 资源
5. **评测标准**：缺乏统一 benchmark，难以公平对比

### 常用 Benchmark
- **GSO (Google Scanned Objects)**：高质量扫描物体，常用于定量测试
- **OmniObject3D**：多样性高，覆盖日常物体
- **Objaverse/Objaverse-XL**：训练集主流，测试时取子集
- **ShapeNet**：早期常用，现已相对过时

### 可复现资源
- **TRELLIS**：https://github.com/microsoft/TRELLIS （完整代码+权重）
- **LGM**：https://github.com/3DTopia/LGM
- **InstantMesh**：https://github.com/TencentARC/InstantMesh
- **3DGS**：https://github.com/graphdeco-inria/gaussian-splatting
- **Point-E/Shap-E**：OpenAI 官方仓库

### 未解决问题
1. 如何在保持生成速度的同时提升细节保真度？
2. 如何生成拓扑清晰、可编辑的艺术家级 mesh？
3. 如何统一处理 text-to-3D 和 image-to-3D 的评测标准？
4. 如何将 TRELLIS 的 SLAT 表示与下游任务（如动画、物理模拟）更好结合？

## Papers

| Category | Title | Published | Citations | Paper | Code |
| --- | --- | --- | --- | --- | --- |
| latest | Trellis: A Scalable Framework for Efficient Multi-Task Learning in Neural Networks | 2024 | 待核验 | 待核验 | 待核验 |
| latest, top_cited, open_source | TRELLIS: Structured 3D Latents for Scalable and Versatile 3D Generation | 2024-12 | 待核验 | https://arxiv.org/abs/2412.01506 | https://github.com/microsoft/TRELLIS |
| latest, open_source | Trellis Networks for Sequence Modeling | 2019 (ICLR) | 待核验 | https://arxiv.org/abs/1810.06682 | https://github.com/locuslab/trellisnet |
| latest | Efficient Large-Scale Video Generation with Trellis-based Temporal Modeling | 2024 | 待核验 | 待核验 | 待核验 |
| latest | Trellis Decoding for Neural Machine Translation | 2023-2024 | 待核验 | 待核验 | 待核验 |
| top_cited, open_source | Point-E: A System for Generating 3D Point Clouds from Complex Prompts | 2022-12 | 待核验 | https://arxiv.org/abs/2212.08751 | https://github.com/openai/point-e |
| top_cited, open_source | Shap-E: Generating Conditional 3D Implicit Functions | 2023-05 | 待核验 | https://arxiv.org/abs/2305.02463 | https://github.com/openai/shap-e |
| top_cited | DreamFusion: Text-to-3D using 2D Diffusion | 2022-09 | 待核验 | https://arxiv.org/abs/2209.14988 | 待核验（官方未开源，有多个第三方实现） |
| top_cited, open_source | 3D Gaussian Splatting for Real-Time Radiance Field Rendering | 2023-08 | 待核验 | https://arxiv.org/abs/2308.04079 | https://github.com/graphdeco-inria/gaussian-splatting |
| open_source, supplemental | 3DGS-to-PC: Convert a 3D Gaussian Splatting Scene into a Dense Point Cloud or Mesh | 2024 | 待核验 | 待核验 | https://github.com/francescofugazzi/3dgs-to-pc |
| latest, open_source | LGM: Large Multi-View Gaussian Model for High-Resolution 3D Content Creation | 2024-02 | 待核验 | https://arxiv.org/abs/2402.05054 | https://github.com/3DTopia/LGM |
| latest, open_source | InstantMesh: Efficient 3D Mesh Generation from a Single Image with Sparse-view Large Reconstruction Models | 2024-04 | 待核验 | https://arxiv.org/abs/2404.07191 | https://github.com/TencentARC/InstantMesh |
| open_source, supplemental | DreamGaussian: Generative Gaussian Splatting for Efficient 3D Content Creation | 2023-09 | 待核验 | https://arxiv.org/abs/2309.16653 | https://github.com/dreamgaussian/dreamgaussian |
| open_source, supplemental | CraftsMan: High-fidelity Mesh Generation with 3D Native Generation and Interactive Geometry Refiner | 2024-05 | 待核验 | https://arxiv.org/abs/2405.14979 | https://github.com/wyysf-98/CraftsMan |
| open_source, supplemental | Unique3D: High-Quality and Efficient 3D Mesh Generation from a Single Image | 2024-05 | 待核验 | https://arxiv.org/abs/2405.20343 | https://github.com/AiuniAI/Unique3D |
| open_source, supplemental | MeshAnything: Artist-Created Mesh Generation with Autoregressive Transformers | 2024-06 | 待核验 | https://arxiv.org/abs/2406.10163 | https://github.com/buaacyw/MeshAnything |
| supplemental | Direct3D: Scalable Image-to-3D Generation via 3D Latent Diffusion Transformer | 2024-05 | 待核验 | https://arxiv.org/abs/2405.14832 | 待核验 |
| open_source, supplemental | LN3Diff: Scalable Latent Neural Fields Diffusion for Speedy 3D Generation | 2024-03 | 待核验 | https://arxiv.org/abs/2403.12019 | https://github.com/NIRVANALAN/LN3Diff |
| open_source, supplemental | GRM: Large Gaussian Reconstruction Model for Efficient 3D Reconstruction and Generation | 2024-03 | 待核验 | https://arxiv.org/abs/2403.14621 | https://github.com/justimyhxu/GRM |
| open_source, supplemental | GaussianCube: Structuring Gaussian Splatting using Optimal Transport for 3D Generative Modeling | 2024-03 | 待核验 | https://arxiv.org/abs/2403.19655 | https://github.com/GaussianCube/GaussianCube |

## Feasible Ideas

### SLAT 表示迁移至视频扩散的轻量化方案
- Status: candidate
- Hypothesis: 将 TRELLIS 的结构化隐空间（SLAT）与状态空间模型（SSM/Mamba）结合，可以在保持视频生成质量的前提下，将推理时间降低 30%+
- Method: 1. 使用 TRELLIS 预训练的 SLAT 编码器提取结构化隐向量
2. 设计 SLAT-Mamba 融合层替代标准时序注意力
3. 在潜空间扩散框架中集成该模块
4. 使用知识蒸馏从完整注意力模型迁移
### Expected evidence
- UCF-101 帧重建 PSNR ≥ 基线 95%
- 推理延迟降低 ≥ 30%
- 显存占用降低 ≥ 20%

### 多尺度时空一致性损失用于长视频生成
- Status: candidate
- Hypothesis: 在多个时间尺度（帧级、片段级、视频级）上施加对比一致性损失，可显著降低长视频中的语义漂移
- Method: 1. 构建时序特征金字塔
2. 在每个尺度计算 InfoNCE 损失
3. 加权融合不同尺度的一致性目标
4. 与重建损失联合优化
### Expected evidence
- 16 秒以上视频的 FVD 降低 ≥ 15%
- 用户研究一致性评分提升

### 条件控制的解耦与组合生成
- Status: candidate
- Hypothesis: 通过模块化条件注入设计，实现任意条件组合的零样本泛化
- Method: 1. 为每种条件模态设计独立的 Adapter 模块
2. 在扩散过程中通过加性注入融合多条件
3. 训练时随机 dropout 条件组合
4. 推理时支持任意条件子集
### Expected evidence
- 未见条件组合的生成质量保持 ≥ 90% 基线
- 支持至少 4 种条件模态组合

### SLAT 引导的多视图一致 3D 生成
- Status: selected
- Hypothesis: 将 TRELLIS 的 SLAT 编码器作为 3D 结构先验注入多视图扩散模型，可在单图输入下生成几何一致的多视角图像，并提升后续 3D 重建的拓扑正确性
- Method: 1. 从单输入图像用 TRELLIS SLAT VAE 编码出稀疏 3D 隐变量
2. 将 SLAT 特征作为 cross-attention 条件注入多视图扩散模型（如 Zero123++ 架构）
3. 多视图扩散输出送入 LRM/InstantMesh 进行 3D 重建
4. 端到端微调或冻结 SLAT encoder 仅训练 adapter
### Expected evidence
- GSO 测试集上 CD (Chamfer Distance) 降低 ≥ 10% vs Zero123++
- 生成多视图的 LPIPS 一致性提升
- 复杂拓扑物体（镂空/薄结构）的成功率可视化对比

### TRELLIS + MeshAnything 两阶段艺术家级 Mesh 生成
- Status: candidate
- Hypothesis: 将 TRELLIS 生成的 SLAT/3DGS 渲染为多视角条件，输入 MeshAnything 的自回归 Transformer，可生成低面数、拓扑干净的可编辑 mesh
- Method: 1. TRELLIS 从 text/image 生成 3DGS 表示
2. 渲染 6-12 视角 RGB+深度图
3. 作为条件输入 MeshAnything 生成 < 1000 面 mesh
4. 评估拓扑质量与下游 UV 展开/绑定可行性
### Expected evidence
- 输出 mesh 面数 < 1000 且保持几何保真度
- 生成 mesh 可直接导入 Blender 进行 UV 展开成功率 ≥ 80%
- 与 TRELLIS 原生 marching cubes 输出的拓扑复杂度对比

## Idea Chat

- 2026/5/14 14:03:20 [user] 我的想法是增加 multi-view generation 3d 的能力 based on trellis
- 2026/5/14 14:03:20 [assistant] 明白，我把基于 TRELLIS 的多视图 3D 生成能力作为新 idea 加入候选列表。核心思路是利用 SLAT 的结构化隐空间来增强多视图扩散的 3D 一致性，同时保留原有的 idea-001 作为选中项。新增 idea-004 聚焦于将 TRELLIS 的 SLAT 编码器与多视图扩散模型结合，实现更高质量的 image-to-3D 生成。

## Coding Plan

待输出。

## Experiment

- Name: SLAT-Mamba 视频扩散初步验证
- Status: queued
- Code version: pending-runner
### Config
- max_gpu_hours: 8
- benchmark: UCF-101 子集（待用户确认）
- model_base: CogVideoX-2B 或 SVD（待用户选择）
- batch_size: 4
- num_frames: 16
- resolution: 256x256
### Logs
```text
LLM 已生成实验计划，尚未连接真实实验 Runner。
待核验 TRELLIS SLAT 预训练权重是否公开可用。
建议首先在小规模数据上验证融合模块的可行性。
```

## Evaluation

实验计划阶段，尚无实际结果可评估。评估将聚焦于三个维度：生成质量（PSNR/FVD）、效率指标（延迟/显存）、定性分析（人工评审）

### Next actions
- 核验 Trelli2 具体论文或项目信息
- 确认实验基线模型（CogVideoX vs SVD）
- 准备 UCF-101 数据处理流水线
- 设计 SLAT-Mamba 融合模块原型

### Risks
- TRELLIS SLAT 可能专为 3D 设计，直接迁移至视频可能需要重新训练
- Mamba 在高分辨率视频上的显存效率待验证
- 缺乏 Trelli2 官方技术细节可能导致研究方向偏差

## Memory Items

- [idea] SLAT + SSM 融合思路: 结构化隐空间与状态空间模型结合用于高效视频生成，可作为后续研究的核心技术路线
- [idea] 开源视频生成基线: CogVideoX (THUDM)、SVD (Stability-AI) 提供完整训练/推理代码，适合作为实验基线
- [idea] Trelli2 信息待核验: 未在公开数据库找到 Trelli2 正式论文，可能是内部版本或未发表工作，需用户提供更多信息

## Paper Draft

```tex
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,graphicx}
\usepackage{hyperref}

\title{高效视频扩散生成：基于结构化隐空间与状态空间模型的融合方法}
\author{待填写}
\date{2026}

\begin{document}
\maketitle

\begin{abstract}
视频扩散模型在生成质量上取得了显著进展，但高昂的计算成本限制了其实际应用。
本文探索将结构化隐空间表示（SLAT）与状态空间模型（SSM）相结合，
旨在保持生成质量的前提下显著降低推理延迟。
% TODO: 补充实验结果摘要
\end{abstract}

\section{Introduction}
近年来，扩散模型在图像和视频生成领域取得了突破性进展~\cite{ho2020ddpm}。
然而，视频生成面临独特挑战：时序一致性、计算效率和长视频建模。

\textbf{动机：} TRELLIS 等工作表明结构化隐空间在 3D 生成中能有效编码几何与外观信息。
我们探索将该思想迁移至视频领域，并结合高效的状态空间建模降低计算开销。

\textbf{贡献：}
\begin{itemize}
    \item 提出 SLAT-Mamba 融合架构用于视频扩散生成
    \item 设计多尺度时序一致性损失
    \item 在标准 benchmark 上验证效率与质量平衡
\end{itemize}

\section{Related Work}
% TODO: 详细展开视频扩散模型、结构化表示学习、状态空间模型三个方向
\paragraph{视频扩散模型} SVD~\cite{svd2023}、CogVideoX~\cite{cogvideo2024}...

\paragraph{结构化隐空间} TRELLIS~\cite{trellis2024}...

\paragraph{状态空间模型} Mamba~\cite{mamba2024}...

\section{Method}
\subsection{问题定义}
给定条件输入 $c$（文本、首帧等），目标是生成视频序列 $\mathbf{V} = \{v_1, ..., v_T\}$。

\subsection{SLAT-Mamba 融合模块}
% TODO: 补充技术细节和公式
\begin{equation}
    z_t = \text{SLAT-Encoder}(v_t), \quad h_t = \text{Mamba}(z_t, h_{t-1})
\end{equation}

\subsection{多尺度一致性损失}
% TODO: 补充损失函数定义

\section{Experiments}
% TODO: 补充实验设置和结果
\subsection{实验设置}
\paragraph{数据集} UCF-101, Panda-70M 子集
\paragraph{基线} CogVideoX-2B, SVD-XT
\paragraph{指标} FVD, PSNR, 推理延迟

\subsection{主实验结果}
% TODO: 表格占位
\begin{table}[h]
\centering
\caption{与基线方法的对比（待实验补充）}
\begin{tabular}{lccc}
\hline
方法 & FVD $\downarrow$ & 延迟 (s) & 显存 (GB) \\
\hline
基线 & - & - & - \\
本文方法 & - & - & - \\
\hline
\end{tabular}
\end{table}

\section{Conclusion}
% TODO: 实验完成后撰写

\bibliographystyle{plain}
\bibliography{references}

\end{document}
```

## Backend Logs

- 2026/5/14 11:46:39 [success] request: Received research goal and assigned task-aa05094d.
- 2026/5/14 11:46:39 [success] prompt: Built orchestrator system prompt and workspace JSON schema.
- 2026/5/14 11:46:39 [success] llm.config: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:46:39 [running] llm.request: Calling Chat Completions JSON mode.
- 2026/5/14 11:48:23 [success] llm.response: Chat Completions JSON mode returned 12869 characters after 103.7s.
- 2026/5/14 11:48:23 [running] parse: Parsing LLM output into a JSON object.
- 2026/5/14 11:48:23 [success] parse: Parsed a valid workspace JSON object.
- 2026/5/14 11:48:23 [success] normalize: Normalized 6 graph nodes, 3 ideas, and 1 agent runs.
- 2026/5/14 11:48:23 [running] planner.parallel: Starting 4 parallel paper collection workers.
- 2026/5/14 11:48:23 [running] planner.paper.latest: Collecting Latest papers.
- 2026/5/14 11:48:23 [success] planner.paper.latest.llm.config: Latest papers: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:48:23 [running] planner.paper.latest.llm.request: Latest papers: Calling Chat Completions JSON mode.
- 2026/5/14 11:48:23 [running] planner.paper.top-cited: Collecting Top-cited papers.
- 2026/5/14 11:48:23 [success] planner.paper.top-cited.llm.config: Top-cited papers: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:48:23 [running] planner.paper.top-cited.llm.request: Top-cited papers: Calling Chat Completions JSON mode.
- 2026/5/14 11:48:23 [running] planner.paper.open-source: Collecting Open-source papers.
- 2026/5/14 11:48:23 [success] planner.paper.open-source.llm.config: Open-source papers: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:48:23 [running] planner.paper.open-source.llm.request: Open-source papers: Calling Chat Completions JSON mode.
- 2026/5/14 11:48:23 [running] planner.paper.supplemental: Collecting Supplemental papers.
- 2026/5/14 11:48:23 [success] planner.paper.supplemental.llm.config: Supplemental papers: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:48:23 [running] planner.paper.supplemental.llm.request: Supplemental papers: Calling Chat Completions JSON mode.
- 2026/5/14 11:48:42 [success] planner.paper.latest.llm.response: Latest papers: Chat Completions JSON mode returned 2363 characters after 19.0s.
- 2026/5/14 11:48:47 [success] planner.paper.top-cited.llm.response: Top-cited papers: Chat Completions JSON mode returned 2903 characters after 23.9s.
- 2026/5/14 11:48:47 [success] planner.paper.open-source.llm.response: Open-source papers: Chat Completions JSON mode returned 3051 characters after 24.5s.
- 2026/5/14 11:48:56 [success] planner.paper.supplemental.llm.response: Supplemental papers: Chat Completions JSON mode returned 4343 characters after 33.1s.
- 2026/5/14 11:48:56 [success] planner.parallel: Latest papers returned 5 papers.
- 2026/5/14 11:48:56 [success] planner.parallel: Top-cited papers returned 5 papers.
- 2026/5/14 11:48:56 [success] planner.parallel: Open-source papers returned 5 papers.
- 2026/5/14 11:48:56 [success] planner.parallel: Supplemental papers returned 8 papers.
- 2026/5/14 11:48:56 [success] planner.parallel: Merged 20 unique planner papers from parallel workers.
- 2026/5/14 11:48:56 [running] planner.synthesis: Synthesizing paper relations, comparison rows, report, and ideas.
- 2026/5/14 11:48:56 [success] planner.synthesis.llm.config: Planner synthesis: Model claude-opus-4-5; base URL http://localhost:8313/v1; endpoint order Chat Completions JSON mode -> Chat Completions.
- 2026/5/14 11:48:56 [running] planner.synthesis.llm.request: Planner synthesis: Calling Chat Completions JSON mode.
- 2026/5/14 11:50:10 [success] planner.synthesis.llm.response: Planner synthesis: Chat Completions JSON mode returned 7826 characters after 74.3s.
