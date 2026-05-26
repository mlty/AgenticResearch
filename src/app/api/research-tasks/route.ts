import { NextRequest, NextResponse } from "next/server";

import { generateText } from "@/lib/llm-client";
import type {
  AgentRun,
  BackendExecutionLog,
  EvaluationReport,
  Experiment,
  Idea,
  IdeaChatMessage,
  MemoryItem,
  NodeStatus,
  PaperDraft,
  PlannerBrief,
  PlannerChatMessage,
  PlannerComparisonRow,
  PlannerIdea,
  PlannerPaper,
  PlannerPaperCategory,
  PlannerPaperRelation,
  ResearchTask,
  TaskNode,
  TaskStatus,
  WorkspaceTask
} from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NODE_STATUSES: NodeStatus[] = ["pending", "running", "done", "failed", "blocked", "skipped"];
const TASK_STATUSES: TaskStatus[] = ["draft", "running", "blocked", "completed", "failed"];
const IDEA_STATUSES: Idea["status"][] = ["candidate", "selected", "tested", "rejected", "promising"];
const EXPERIMENT_STATUSES: Experiment["status"][] = ["queued", "running", "completed", "failed"];
const PAPER_STATUSES: PaperDraft["status"][] = ["not_started", "drafting", "ready"];
const SECTION_STATES: PaperDraft["sections"][number]["state"][] = ["empty", "seeded", "needs_evidence"];
const MEMORY_TYPES: MemoryItem["type"][] = ["paper", "idea", "experiment", "insight"];
const PLANNER_PAPER_CATEGORIES: PlannerPaperCategory[] = ["latest", "top_cited", "open_source", "supplemental"];
const DEFAULT_PLANNER_BATCH_TIMEOUT_MS = 180000;
const DEFAULT_PLANNER_SYNTHESIS_TIMEOUT_MS = 180000;

type PlannerPaperBatchSpec = {
  id: string;
  category: PlannerPaperCategory;
  label: string;
  count: number;
  instruction: string;
};

const PLANNER_PAPER_BATCHES: PlannerPaperBatchSpec[] = [
  {
    id: "latest",
    category: "latest",
    label: "Latest papers",
    count: 5,
    instruction: "优先找最近 1-2 年与研究目标最相关的论文、预印本或技术报告。"
  },
  {
    id: "top-cited",
    category: "top_cited",
    label: "Top-cited papers",
    count: 5,
    instruction: "优先找引用最多、奠基性或经常被作为 baseline 的论文。"
  },
  {
    id: "open-source",
    category: "open_source",
    label: "Open-source papers",
    count: 5,
    instruction: "优先找有 GitHub、project page、代码 release 或可复现实现的论文。"
  },
  {
    id: "supplemental",
    category: "supplemental",
    label: "Supplemental papers",
    count: 8,
    instruction: "补充覆盖不同路线、数据集、benchmark 或失败案例的候选论文，帮助总数接近 20 篇。"
  }
];

export async function POST(request: NextRequest) {
  let body: { goal?: unknown };

  try {
    body = (await request.json()) as { goal?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";

  if (!goal) {
    return NextResponse.json({ error: "Research goal is required." }, { status: 400 });
  }

  if (wantsExecutionStream(request)) {
    return streamResearchTask(goal);
  }

  const backendLogs: BackendExecutionLog[] = [];
  const log = createBackendLogger(backendLogs);

  try {
    const workspace = await createWorkspaceTask(goal, log, backendLogs);
    return NextResponse.json({ workspace, backendLogs });
  } catch (error) {
    const message = toErrorMessage(error);
    log({ phase: "error", status: "error", message });
    return NextResponse.json({ error: message, backendLogs }, { status: 500 });
  }
}

function wantsExecutionStream(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/x-ndjson") || request.nextUrl.searchParams.get("stream") === "1";
}

function streamResearchTask(goal: string) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        const backendLogs: BackendExecutionLog[] = [];
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };
        const log = createBackendLogger(backendLogs, (entry) => send({ type: "log", entry }));

        void (async () => {
          try {
            const workspace = await createWorkspaceTask(goal, log, backendLogs);
            send({ type: "workspace", workspace, backendLogs });
          } catch (error) {
            const message = toErrorMessage(error);
            log({ phase: "error", status: "error", message });
            send({ type: "error", error: message, backendLogs });
          } finally {
            controller.close();
          }
        })();
      }
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    }
  );
}

type BackendLogger = ReturnType<typeof createBackendLogger>;

function createBackendLogger(logs: BackendExecutionLog[], onEntry?: (entry: BackendExecutionLog) => void) {
  const startedAt = Date.now();
  let sequence = 0;

  return (entry: Pick<BackendExecutionLog, "phase" | "status" | "message">) => {
    sequence += 1;
    const backendLog: BackendExecutionLog = {
      id: `backend-${sequence}`,
      timestamp: formatDateTime(new Date()),
      elapsedMs: Date.now() - startedAt,
      ...entry
    };

    logs.push(backendLog);
    onEntry?.(backendLog);
    return backendLog;
  };
}

async function createWorkspaceTask(goal: string, log: BackendLogger, backendLogs: BackendExecutionLog[]): Promise<WorkspaceTask> {
  const now = new Date();
  const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;

  log({ phase: "request", status: "success", message: `Received research goal and assigned ${taskId}.` });
  log({ phase: "prompt", status: "success", message: "Built orchestrator system prompt and workspace JSON schema." });

  const output = await generateText({
    system: createSystemPrompt(),
    user: createUserPrompt(goal, taskId, now.toISOString()),
    validateText: validateWorkspaceOutput,
    onLog: log
  });

  log({ phase: "parse", status: "running", message: "Parsing LLM output into a JSON object." });
  const parsed = parseJsonObject(output);
  log({ phase: "parse", status: "success", message: "Parsed a valid workspace JSON object." });

  const baseWorkspace = normalizeWorkspaceTask(parsed, goal, taskId, now);
  log({
    phase: "normalize",
    status: "success",
    message: `Normalized ${baseWorkspace.nodes.length} graph nodes, ${baseWorkspace.ideas.length} ideas, and ${baseWorkspace.agentRuns.length} agent runs.`
  });

  const planner = await enrichPlannerWithParallelWorkers(goal, baseWorkspace.planner, log, now);
  const workspace = { ...baseWorkspace, planner };

  return { ...workspace, backendLogs: [...backendLogs] };
}

function createSystemPrompt() {
  return [
    "你是 Agentic Research Workspace 的后端 Agent Orchestrator。",
    "你必须基于用户研究目标，真实执行一次规划与产物生成：拆解任务图、生成候选 idea、设计代码计划、设计实验方案、生成评估计划、沉淀 memory 项，以及产出 LaTeX 论文初稿骨架。",
    "Planner 阶段必须收集和整合相关论文、开源代码线索、现有工作状态报告，并给出可行 idea。引用数、链接或代码仓库如果不确定，必须标注为待核验，不要伪装成已核验事实。",
    "只输出一个 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。",
    "不要编造已经完成的真实实验指标。除非用户明确提供实验结果，否则 experiment.metrics 必须是空数组，experiment.status 必须是 queued。",
    "可以生成可执行实验配置、命令建议、评估标准和 LaTeX 草稿，但必须明确它们是待执行计划。",
    "所有字段必须使用中文内容，id/status/type 等枚举字段保持英文。"
  ].join("\n");
}

function createUserPrompt(goal: string, taskId: string, isoNow: string) {
  return `
研究目标：${goal}
当前时间：${isoNow}
任务 ID：${taskId}

请严格返回以下 JSON 结构：
{
  "task": {
    "id": "${taskId}",
    "goal": "${goal}",
    "domain": "研究领域名称",
    "status": "running",
    "activeNodeId": "planner",
    "updatedAt": "${isoNow}",
    "progress": 35
  },
  "nodes": [
    {
      "id": "planner",
      "label": "Planner",
      "agent": "Planner Agent",
      "status": "done",
      "summary": "节点摘要",
      "input": "节点输入",
      "output": "节点输出",
      "artifact": "artifact 名称"
    }
  ],
  "planner": {
    "papers": [
      {
        "id": "paper-001",
        "title": "论文标题",
        "url": "论文链接或待核验",
        "publishedAt": "发布时间或待核验",
        "citations": "引用数或待核验",
        "citationCount": 0,
        "summary": "论文简介，说明核心方法、数据、结论和局限",
        "codeUrl": "开源 GitHub 链接或待核验",
        "categories": ["latest"]
      }
    ],
    "paperRelations": [
      {
        "sourceId": "paper-001",
        "targetId": "paper-002",
        "relation": "extends | compares_with | uses_baseline | shares_benchmark | inspires",
        "evidence": "说明两个工作之间的引用、方法继承、benchmark 或对比关系；不确定写待核验"
      }
    ],
    "comparisonRows": [
      {
        "axis": "方法路线/数据/benchmark/工程可复现性/主要瓶颈",
        "latest": "最新论文组的特点",
        "topCited": "高引用论文组的特点",
        "openSource": "开源论文组的特点",
        "takeaway": "对本任务的结论"
      }
    ],
    "report": "整合现有工作的状态报告：主流路线、关键瓶颈、常用 benchmark、可复现资源、未解决问题。",
    "ideas": [
      {
        "id": "planner-idea-001",
        "title": "可行 idea 标题",
        "rationale": "为什么这个 idea 值得尝试",
        "firstExperiment": "第一步最小验证实验"
      }
    ],
    "chatMessages": [
      {
        "id": "planner-chat-001",
        "role": "assistant",
        "content": "我已经完成第一版 paper 收集、现状报告和 idea 草案，可以继续通过 chat 指定补充方向。",
        "createdAt": "${isoNow}"
      }
    ]
  },
  "ideas": [
    {
      "id": "idea-001",
      "title": "idea 标题",
      "status": "selected",
      "hypothesis": "可验证假设",
      "methodSketch": "方法草图",
      "expectedEvidence": ["预期证据 1", "预期证据 2"]
    }
  ],
  "experiment": {
    "id": "exp-plan-001",
    "name": "实验名称",
    "status": "queued",
    "codeVersion": "pending-runner",
    "config": {
      "max_gpu_hours": 8,
      "benchmark": "待用户确认"
    },
    "metrics": [],
    "logs": ["LLM 已生成实验计划，尚未连接真实实验 Runner。"]
  },
  "evaluation": {
    "summary": "评估计划摘要",
    "improvement": "unknown",
    "nextActions": ["下一步行动"],
    "risks": ["风险"]
  },
  "agentRuns": [
    {
      "id": "run-planner-001",
      "agent": "Planner Agent",
      "status": "done",
      "startedAt": "${isoNow}",
      "message": "执行摘要",
      "toolCalls": ["llm.plan_research_task"]
    }
  ],
  "memoryItems": [
    {
      "id": "mem-001",
      "type": "idea",
      "title": "记忆标题",
      "description": "记忆描述"
    }
  ],
  "paperDraft": {
    "title": "论文标题",
    "status": "drafting",
    "sections": [
      { "title": "Abstract", "state": "seeded" },
      { "title": "Introduction", "state": "seeded" },
      { "title": "Related Work", "state": "needs_evidence" },
      { "title": "Method", "state": "seeded" },
      { "title": "Experiments", "state": "needs_evidence" },
      { "title": "Conclusion", "state": "empty" }
    ],
    "latexPreview": "\\documentclass{article}\n\\title{...}\n\\begin{document}\n\\maketitle\n...\n\\end{document}"
  }
}

nodes 必须包含 planner、idea、coding、experiment、evaluation、paper 六个节点。
planner.papers 在这个主规划请求里只需要返回 3-5 篇种子论文线索即可；详细的 20 篇论文收集会由后端并发 paper workers 分批完成。
planner.paperRelations 和 planner.comparisonRows 可以返回少量草案或空数组；后端会在 paper workers 完成后再合成引用关系和比较表。
planner.report 必须给出第一版现状报告，不要只列 bullet；planner.ideas 至少返回 3 个可行 idea。
ideas 至少返回 3 个候选，其中 1 个 status 为 selected。
paperDraft.latexPreview 必须是可继续编辑的 LaTeX 初稿骨架。
`;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const jsonText = extractFirstJsonObject(trimmed);
    return JSON.parse(jsonText) as Record<string, unknown>;
  }
}

function validateWorkspaceOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);
    const task = asRecord(parsed.task);

    if (Object.keys(task).length === 0) {
      return "missing task object";
    }

    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return "missing nodes array";
    }

    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      return "missing ideas array";
    }

    return null;
  } catch (error) {
    return toErrorMessage(error);
  }
}

async function enrichPlannerWithParallelWorkers(
  goal: string,
  basePlanner: PlannerBrief,
  log: BackendLogger,
  now: Date
): Promise<PlannerBrief> {
  log({
    phase: "planner.parallel",
    status: "running",
    message: `Starting ${PLANNER_PAPER_BATCHES.length} parallel paper collection workers.`
  });

  const batchResults = await Promise.allSettled(
    PLANNER_PAPER_BATCHES.map((batch) => collectPlannerPaperBatch(goal, batch, log))
  );
  const batchPapers: PlannerPaper[] = [];

  batchResults.forEach((result, index) => {
    const batch = PLANNER_PAPER_BATCHES[index];

    if (result.status === "fulfilled") {
      batchPapers.push(...result.value);
      log({
        phase: "planner.parallel",
        status: "success",
        message: `${batch.label} returned ${result.value.length} papers.`
      });
      return;
    }

    log({
      phase: "planner.parallel",
      status: "warning",
      message: `${batch.label} failed: ${toErrorMessage(result.reason)}`
    });
  });

  const papers = mergePlannerPapers([...batchPapers, ...basePlanner.papers]).slice(0, 20);
  const plannerWithPapers: PlannerBrief = {
    ...basePlanner,
    papers: papers.length > 0 ? papers : basePlanner.papers
  };

  log({
    phase: "planner.parallel",
    status: papers.length > 0 ? "success" : "warning",
    message: `Merged ${plannerWithPapers.papers.length} unique planner papers from parallel workers.`
  });

  if (plannerWithPapers.papers.length === 0) {
    return basePlanner;
  }

  try {
    const synthesis = await synthesizePlannerArtifacts(goal, plannerWithPapers, log, now);
    return {
      papers: plannerWithPapers.papers,
      paperRelations: synthesis.paperRelations.length > 0 ? synthesis.paperRelations : plannerWithPapers.paperRelations,
      comparisonRows: synthesis.comparisonRows.length > 0 ? synthesis.comparisonRows : plannerWithPapers.comparisonRows,
      report: synthesis.report,
      ideas: synthesis.ideas.length > 0 ? synthesis.ideas : plannerWithPapers.ideas,
      chatMessages: synthesis.chatMessages.length > 0 ? synthesis.chatMessages : plannerWithPapers.chatMessages
    };
  } catch (error) {
    log({
      phase: "planner.synthesis",
      status: "warning",
      message: `Planner synthesis failed; keeping paper batches with base report: ${toErrorMessage(error)}`
    });
    return plannerWithPapers;
  }
}

async function collectPlannerPaperBatch(goal: string, batch: PlannerPaperBatchSpec, log: BackendLogger): Promise<PlannerPaper[]> {
  log({ phase: `planner.paper.${batch.id}`, status: "running", message: `Collecting ${batch.label}.` });

  const output = await generateText({
    system: createPlannerPaperBatchSystemPrompt(),
    user: createPlannerPaperBatchUserPrompt(goal, batch),
    validateText: validatePlannerPaperBatchOutput,
    timeoutMs: getPlannerBatchTimeoutMs(),
    onLog: createScopedLogger(log, `planner.paper.${batch.id}`, batch.label)
  });
  const parsed = parseJsonObject(output);
  const papers = normalizePlannerPapersForBatch(asRecord(parsed).papers, batch);

  return papers;
}

function createPlannerPaperBatchSystemPrompt() {
  return [
    "你是 Agentic Research Workspace 的 literature search worker。",
    "你的任务是只完成一个小批次的论文线索收集，不要生成完整 workspace。",
    "引用数、链接、开源仓库如果不确定，必须写待核验；不要把不确定信息伪装成事实。",
    "只输出一个 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。",
    "所有自然语言字段使用中文，id/categories 等结构字段保持英文。"
  ].join("\n");
}

function createPlannerPaperBatchUserPrompt(goal: string, batch: PlannerPaperBatchSpec) {
  return `
研究目标：${goal}
批次：${batch.label}
要求：${batch.instruction}

请返回 ${batch.count} 篇论文线索，严格使用以下 JSON 结构：
{
  "papers": [
    {
      "id": "${batch.id}-paper-001",
      "title": "论文标题",
      "url": "论文链接或待核验",
      "publishedAt": "发布时间或待核验",
      "citations": "引用数或待核验",
      "citationCount": 0,
      "summary": "论文简介：核心方法、数据/benchmark、主要结论、局限",
      "codeUrl": "GitHub/project page/代码链接或待核验",
      "categories": ["${batch.category}"]
    }
  ]
}

每篇 categories 必须包含 "${batch.category}"。
如果同一论文也属于其他类别，可以追加 latest/top_cited/open_source/supplemental。
citationCount 不确定时用 0；不要为了凑数编造精确引用数。
`;
}

function validatePlannerPaperBatchOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);
    return Array.isArray(asRecord(parsed).papers) ? null : "missing papers array";
  } catch (error) {
    return toErrorMessage(error);
  }
}

async function synthesizePlannerArtifacts(
  goal: string,
  planner: PlannerBrief,
  log: BackendLogger,
  now: Date
): Promise<Omit<PlannerBrief, "papers">> {
  log({ phase: "planner.synthesis", status: "running", message: "Synthesizing paper relations, comparison rows, report, and ideas." });

  const output = await generateText({
    system: createPlannerSynthesisSystemPrompt(),
    user: createPlannerSynthesisUserPrompt(goal, planner, now.toISOString()),
    validateText: validatePlannerSynthesisOutput,
    timeoutMs: getPlannerSynthesisTimeoutMs(),
    onLog: createScopedLogger(log, "planner.synthesis", "Planner synthesis")
  });
  const parsed = parseJsonObject(output);
  const record = asRecord(asRecord(parsed).planner ?? parsed);

  return {
    paperRelations: normalizePlannerPaperRelations(record.paperRelations),
    comparisonRows: normalizePlannerComparisonRows(record.comparisonRows),
    report: asString(record.report, planner.report),
    ideas: normalizePlannerIdeas(record.ideas),
    chatMessages: normalizePlannerChatMessages(record.chatMessages, now)
  };
}

function createPlannerSynthesisSystemPrompt() {
  return [
    "你是 Agentic Research Workspace 的 research synthesis worker。",
    "你会基于已经收集到的论文线索，生成引用/方法关系、比较表、现状报告和可行 idea。",
    "只使用输入论文中的 id 来建立 paperRelations；不确定的关系必须在 evidence 写待核验。",
    "只输出一个 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。",
    "所有自然语言字段使用中文，id/status/type 等结构字段保持英文。"
  ].join("\n");
}

function createPlannerSynthesisUserPrompt(goal: string, planner: PlannerBrief, isoNow: string) {
  const papers = planner.papers.map((paper) => ({
    id: paper.id,
    title: paper.title,
    publishedAt: paper.publishedAt,
    citations: paper.citations,
    citationCount: paper.citationCount,
    categories: paper.categories,
    codeUrl: paper.codeUrl,
    summary: paper.summary
  }));

  return `
研究目标：${goal}

已收集论文线索：
${JSON.stringify(papers, null, 2)}

请严格返回以下 JSON 结构：
{
  "paperRelations": [
    {
      "sourceId": "paper-001",
      "targetId": "paper-002",
      "relation": "extends | compares_with | uses_baseline | shares_benchmark | inspires",
      "evidence": "关系依据；不确定写待核验"
    }
  ],
  "comparisonRows": [
    {
      "axis": "方法路线/数据/benchmark/工程可复现性/主要瓶颈",
      "latest": "最新论文组的特点",
      "topCited": "高引用论文组的特点",
      "openSource": "开源论文组的特点",
      "takeaway": "对本任务的结论"
    }
  ],
  "report": "整合现有工作的状态报告：主流路线、关键瓶颈、常用 benchmark、可复现资源、未解决问题。",
  "ideas": [
    {
      "id": "planner-idea-001",
      "title": "可行 idea 标题",
      "rationale": "为什么这个 idea 值得尝试",
      "firstExperiment": "第一步最小验证实验"
    }
  ],
  "chatMessages": [
    {
      "id": "planner-chat-001",
      "role": "assistant",
      "content": "我已经完成并发 paper 收集、关系梳理、比较表和第一版 idea。",
      "createdAt": "${isoNow}"
    }
  ]
}

paperRelations 至少 8 条，comparisonRows 至少 5 行，ideas 至少 3 个。
`;
}

function validatePlannerSynthesisOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);
    const record = asRecord(asRecord(parsed).planner ?? parsed);

    if (!Array.isArray(record.paperRelations)) {
      return "missing paperRelations array";
    }

    if (!Array.isArray(record.comparisonRows)) {
      return "missing comparisonRows array";
    }

    if (!asString(record.report, "").trim()) {
      return "missing report";
    }

    if (!Array.isArray(record.ideas)) {
      return "missing ideas array";
    }

    return null;
  } catch (error) {
    return toErrorMessage(error);
  }
}

function normalizePlannerPapersForBatch(value: unknown, batch: PlannerPaperBatchSpec): PlannerPaper[] {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, batch.count).map((item, index) => {
    const record = asRecord(item);
    const rawCategories = Array.isArray(record.categories)
      ? record.categories.filter(
          (category): category is PlannerPaperCategory =>
            typeof category === "string" && PLANNER_PAPER_CATEGORIES.includes(category as PlannerPaperCategory)
        )
      : [];
    const categories = mergePlannerPaperCategories([batch.category], rawCategories);

    return {
      id: asString(record.id, `${batch.id}-paper-${String(index + 1).padStart(3, "0")}`),
      title: asString(record.title, `${batch.label} ${index + 1}`),
      url: asString(record.url, "待核验"),
      publishedAt: asString(record.publishedAt, "待核验"),
      citations: asString(record.citations, "待核验"),
      citationCount: asNumber(record.citationCount, parseCitationCount(record.citations)),
      summary: asString(record.summary, "待补充论文简介。"),
      codeUrl: asString(record.codeUrl, "待核验"),
      categories
    } satisfies PlannerPaper;
  });
}

function mergePlannerPapers(papers: PlannerPaper[]): PlannerPaper[] {
  const merged = new Map<string, PlannerPaper>();

  for (const paper of papers) {
    const key = getPlannerPaperMergeKey(paper);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, paper);
      continue;
    }

    merged.set(key, {
      ...existing,
      url: chooseVerifiedValue(existing.url, paper.url),
      publishedAt: chooseVerifiedValue(existing.publishedAt, paper.publishedAt),
      citations: paper.citationCount > existing.citationCount ? paper.citations : existing.citations,
      citationCount: Math.max(existing.citationCount, paper.citationCount),
      summary: paper.summary.length > existing.summary.length ? paper.summary : existing.summary,
      codeUrl: chooseVerifiedValue(existing.codeUrl, paper.codeUrl),
      categories: mergePlannerPaperCategories(existing.categories, paper.categories)
    });
  }

  return Array.from(merged.values()).map((paper, index) => ({
    ...paper,
    id: `paper-${String(index + 1).padStart(3, "0")}`
  }));
}

function getPlannerPaperMergeKey(paper: PlannerPaper) {
  if (isVerifiedPlannerValue(paper.url)) {
    return `url:${paper.url.trim().toLowerCase()}`;
  }

  return `title:${paper.title.trim().toLowerCase()}`;
}

function chooseVerifiedValue(current: string, candidate: string) {
  if (!isVerifiedPlannerValue(current) && isVerifiedPlannerValue(candidate)) {
    return candidate;
  }

  return current;
}

function isVerifiedPlannerValue(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== "待核验" && !normalized.includes("待核验");
}

function mergePlannerPaperCategories(first: PlannerPaperCategory[], second: PlannerPaperCategory[]): PlannerPaperCategory[] {
  return PLANNER_PAPER_CATEGORIES.filter((category) => first.includes(category) || second.includes(category));
}

function createScopedLogger(log: BackendLogger, phasePrefix: string, label: string): BackendLogger {
  return (entry) =>
    log({
      phase: `${phasePrefix}.${entry.phase}`,
      status: entry.status,
      message: `${label}: ${entry.message}`
    });
}

function getPlannerBatchTimeoutMs() {
  return getPositiveNumberFromEnv("LLM_PAPER_BATCH_TIMEOUT_MS", DEFAULT_PLANNER_BATCH_TIMEOUT_MS);
}

function getPlannerSynthesisTimeoutMs() {
  return getPositiveNumberFromEnv("LLM_PLANNER_SYNTHESIS_TIMEOUT_MS", DEFAULT_PLANNER_SYNTHESIS_TIMEOUT_MS);
}

function getPositiveNumberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");

  if (start < 0) {
    throw new Error("LLM response did not contain a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  throw new Error("LLM response contained an incomplete JSON object.");
}

function normalizeWorkspaceTask(value: Record<string, unknown>, goal: string, taskId: string, now: Date): Omit<WorkspaceTask, "backendLogs"> {
  const taskRecord = asRecord(value.task);
  const ideas = normalizeIdeas(value.ideas);
  const nodes = normalizeNodes(value.nodes, ideas);
  const activeNodeId = nodes.some((node) => node.id === "planner") ? "planner" : getActiveNodeId(nodes, taskRecord.activeNodeId);

  return {
    task: {
      id: asString(taskRecord.id, taskId),
      goal: asString(taskRecord.goal, goal),
      domain: asString(taskRecord.domain, "待识别研究领域"),
      status: asEnum(taskRecord.status, TASK_STATUSES, "running"),
      activeNodeId,
      updatedAt: asString(taskRecord.updatedAt, formatDateTime(now)),
      progress: asNumber(taskRecord.progress, 35)
    },
    planner: normalizePlanner(value.planner, goal, now),
    nodes,
    ideas,
    ideaChatMessages: normalizeIdeaChatMessages(value.ideaChatMessages, now),
    experiment: normalizeExperiment(value.experiment),
    evaluation: normalizeEvaluation(value.evaluation),
    agentRuns: normalizeAgentRuns(value.agentRuns, now),
    memoryItems: normalizeMemoryItems(value.memoryItems),
    paperDraft: normalizePaperDraft(value.paperDraft)
  };
}

function normalizePlanner(value: unknown, goal: string, now: Date): PlannerBrief {
  const record = asRecord(value);
  const papers = normalizePlannerPapers(record.papers);
  const paperRelations = normalizePlannerPaperRelations(record.paperRelations);
  const comparisonRows = normalizePlannerComparisonRows(record.comparisonRows);
  const plannerIdeas = normalizePlannerIdeas(record.ideas);
  const chatMessages = normalizePlannerChatMessages(record.chatMessages, now);

  return {
    papers: papers.length > 0 ? papers : createFallbackPlannerPapers(goal),
    paperRelations,
    comparisonRows: comparisonRows.length > 0 ? comparisonRows : createFallbackComparisonRows(),
    report: asString(
      record.report,
      `围绕“${goal}”的 Planner 报告尚未充分生成。建议继续通过 chat 明确目标领域、数据集、baseline 和希望优先关注的论文类型。`
    ),
    ideas: plannerIdeas.length > 0 ? plannerIdeas : createFallbackPlannerIdeas(goal),
    chatMessages:
      chatMessages.length > 0
        ? chatMessages
        : [
            {
              id: "planner-chat-001",
              role: "assistant",
              content: "已生成第一版 Planner 结果。你可以继续要求我补充论文、重写报告、收敛 idea 或按 benchmark 重新整理。",
              createdAt: formatDateTime(now)
            }
          ]
  };
}

function normalizePlannerPapers(value: unknown): PlannerPaper[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `paper-${index + 1}`),
      title: asString(record.title, `Paper ${index + 1}`),
      url: asString(record.url, "待核验"),
      publishedAt: asString(record.publishedAt, "待核验"),
      citations: asString(record.citations, "待核验"),
      citationCount: asNumber(record.citationCount, parseCitationCount(record.citations)),
      summary: asString(record.summary, "待补充论文简介。"),
      codeUrl: asString(record.codeUrl, "待核验"),
      categories: normalizePlannerPaperCategories(record.categories, index)
    } satisfies PlannerPaper;
  });
}

function normalizePlannerPaperCategories(value: unknown, index: number): PlannerPaperCategory[] {
  const categories = Array.isArray(value)
    ? value.filter((item): item is PlannerPaperCategory => typeof item === "string" && PLANNER_PAPER_CATEGORIES.includes(item as PlannerPaperCategory))
    : [];

  if (categories.length > 0) {
    return categories;
  }

  if (index < 5) {
    return ["latest"];
  }

  if (index < 10) {
    return ["top_cited"];
  }

  if (index < 15) {
    return ["open_source"];
  }

  return ["supplemental"];
}

function normalizePlannerPaperRelations(value: unknown): PlannerPaperRelation[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    const record = asRecord(item);
    return {
      sourceId: asString(record.sourceId, "paper-001"),
      targetId: asString(record.targetId, "paper-002"),
      relation: asString(record.relation, "待核验"),
      evidence: asString(record.evidence, "待核验")
    } satisfies PlannerPaperRelation;
  });
}

function normalizePlannerComparisonRows(value: unknown): PlannerComparisonRow[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      axis: asString(record.axis, `Comparison axis ${index + 1}`),
      latest: asString(record.latest, "待补充"),
      topCited: asString(record.topCited, "待补充"),
      openSource: asString(record.openSource, "待补充"),
      takeaway: asString(record.takeaway, "待补充")
    } satisfies PlannerComparisonRow;
  });
}

function normalizePlannerIdeas(value: unknown): PlannerIdea[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `planner-idea-${index + 1}`),
      title: asString(record.title, `Planner idea ${index + 1}`),
      rationale: asString(record.rationale, "待补充可行性依据。"),
      firstExperiment: asString(record.firstExperiment, "待补充最小验证实验。")
    } satisfies PlannerIdea;
  });
}

function normalizePlannerChatMessages(value: unknown, now: Date): PlannerChatMessage[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `planner-chat-${index + 1}`),
      role: asEnum(record.role, ["user", "assistant"], "assistant"),
      content: asString(record.content, "待补充 Planner 对话。"),
      createdAt: asString(record.createdAt, formatDateTime(now))
    } satisfies PlannerChatMessage;
  });
}

function createFallbackPlannerPapers(goal: string): PlannerPaper[] {
  return [
    {
      id: "paper-fallback-001",
      title: `围绕“${goal}”的相关论文线索`,
      url: "待核验",
      publishedAt: "待核验",
      citations: "待核验",
      citationCount: 0,
      summary: "LLM 未返回足够论文元数据。请通过 Planner Chat 要求补充特定方向、会议或 benchmark 的论文线索。",
      codeUrl: "待核验",
      categories: ["supplemental"]
    }
  ];
}

function createFallbackComparisonRows(): PlannerComparisonRow[] {
  return [
    {
      axis: "可复现性",
      latest: "待补充最新论文实现状态。",
      topCited: "待补充经典高引用方法复现状态。",
      openSource: "待核验开源仓库和实验脚本。",
      takeaway: "优先通过 Planner Chat 补充可复现资源。"
    }
  ];
}

function createFallbackPlannerIdeas(goal: string): PlannerIdea[] {
  return [
    {
      id: "planner-idea-fallback-001",
      title: `为“${goal}”补充可行 idea`,
      rationale: "当前 Planner 结果缺少结构化 idea，需要通过 chat 继续收敛。",
      firstExperiment: "先指定目标数据集和 baseline，再生成最小验证实验。"
    }
  ];
}

function normalizeNodes(value: unknown, ideas: Idea[]): TaskNode[] {
  const nodes = Array.isArray(value) ? value : [];
  return nodes.map((node, index) => {
    const record = asRecord(node);
    const id = asString(record.id, `node-${index + 1}`);
    const status = normalizeNodeStatus(id, record.status, ideas);

    return {
      id,
      label: asString(record.label, `Node ${index + 1}`),
      agent: asString(record.agent, "Agent"),
      status,
      summary: asString(record.summary, "等待 Agent 输出。"),
      input: asString(record.input, "待输入。"),
      output: asString(record.output, "待输出。"),
      artifact: asString(record.artifact, "pending")
    } satisfies TaskNode;
  });
}

function normalizeNodeStatus(id: string, value: unknown, ideas: Idea[]): NodeStatus {
  const status = asEnum(value, NODE_STATUSES, "pending");

  if (id !== "idea" || status === "failed" || status === "blocked") {
    return status;
  }

  if (ideas.some((idea) => idea.status === "selected")) {
    return "done";
  }

  if (ideas.length > 0) {
    return "pending";
  }

  return status;
}

function getActiveNodeId(nodes: TaskNode[], value: unknown) {
  const requestedId = typeof value === "string" ? value : "";
  const requestedNode = nodes.find((node) => node.id === requestedId);

  if (requestedNode && requestedNode.status !== "done" && requestedNode.status !== "skipped") {
    return requestedNode.id;
  }

  return nodes.find((node) => node.status === "running")?.id ?? nodes.find((node) => node.status === "pending")?.id ?? nodes[0]?.id ?? "planner";
}

function normalizeIdeas(value: unknown): Idea[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `idea-${index + 1}`),
      title: asString(record.title, `Idea ${index + 1}`),
      status: asEnum(record.status, IDEA_STATUSES, index === 0 ? "selected" : "candidate"),
      hypothesis: asString(record.hypothesis, "待补充假设。"),
      methodSketch: asString(record.methodSketch, "待补充方法草图。"),
      expectedEvidence: asStringArray(record.expectedEvidence)
    } satisfies Idea;
  });
}

function normalizeIdeaChatMessages(value: unknown, now: Date): IdeaChatMessage[] {
  const items = Array.isArray(value) ? value : [];
  const messages = items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `idea-chat-${index + 1}`),
      role: asEnum(record.role, ["user", "assistant"], "assistant"),
      content: asString(record.content, "待补充 Idea 对话。"),
      createdAt: asString(record.createdAt, formatDateTime(now))
    } satisfies IdeaChatMessage;
  });

  return messages.length > 0
    ? messages
    : [
        {
          id: "idea-chat-001",
          role: "assistant",
          content: "已生成第一版候选 idea。你可以让我新增、合并、重写、打分或把某个 idea 收敛成最小实验。",
          createdAt: formatDateTime(now)
        }
      ];
}

function normalizeExperiment(value: unknown): Experiment {
  const record = asRecord(value);
  return {
    id: asString(record.id, "exp-plan-001"),
    name: asString(record.name, "待执行实验计划"),
    status: asEnum(record.status, EXPERIMENT_STATUSES, "queued"),
    codeVersion: asString(record.codeVersion, "pending-runner"),
    config: asConfig(record.config),
    metrics: normalizeMetrics(record.metrics),
    logs: asStringArray(record.logs)
  };
}

function normalizeMetrics(value: unknown): Experiment["metrics"] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    const record = asRecord(item);
    return {
      label: asString(record.label, "Metric"),
      value: asString(record.value, "pending"),
      trend: asEnum(record.trend, ["up", "down", "flat"], "flat")
    };
  });
}

function normalizeEvaluation(value: unknown): EvaluationReport {
  const record = asRecord(value);
  return {
    summary: asString(record.summary, "等待实验执行后生成评估结论。"),
    improvement: asEnum(record.improvement, ["unknown", "yes", "no"], "unknown"),
    nextActions: asStringArray(record.nextActions),
    risks: asStringArray(record.risks)
  };
}

function normalizeAgentRuns(value: unknown, now: Date): AgentRun[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `run-${index + 1}`),
      agent: asString(record.agent, "Agent"),
      status: asEnum(record.status, NODE_STATUSES, "done"),
      startedAt: asString(record.startedAt, formatDateTime(now)),
      message: asString(record.message, "LLM 执行完成。"),
      toolCalls: asStringArray(record.toolCalls)
    } satisfies AgentRun;
  });
}

function normalizeMemoryItems(value: unknown): MemoryItem[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `mem-${index + 1}`),
      type: asEnum(record.type, MEMORY_TYPES, "idea"),
      title: asString(record.title, `Memory ${index + 1}`),
      description: asString(record.description, "待沉淀内容。")
    } satisfies MemoryItem;
  });
}

function normalizePaperDraft(value: unknown): PaperDraft {
  const record = asRecord(value);
  return {
    title: asString(record.title, "Untitled Research Draft"),
    status: asEnum(record.status, PAPER_STATUSES, "drafting"),
    sections: normalizePaperSections(record.sections),
    latexPreview: asString(record.latexPreview, "\\documentclass{article}\n\\begin{document}\n\\end{document}")
  };
}

function normalizePaperSections(value: unknown): PaperDraft["sections"] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    const record = asRecord(item);
    return {
      title: asString(record.title, "Section"),
      state: asEnum(record.state, SECTION_STATES, "empty")
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseCitationCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const match = value.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asConfig(value: unknown): Experiment["config"] {
  const record = asRecord(value);
  const config: Experiment["config"] = {};

  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      config[key] = item;
    }
  }

  return config;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
