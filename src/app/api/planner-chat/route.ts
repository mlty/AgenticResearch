import { NextRequest, NextResponse } from "next/server";

import { generateText } from "@/lib/llm-client";
import type {
  PlannerBrief,
  PlannerChatMessage,
  PlannerComparisonRow,
  PlannerIdea,
  PlannerPaper,
  PlannerPaperCategory,
  PlannerPaperRelation
} from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLANNER_PAPER_CATEGORIES: PlannerPaperCategory[] = ["latest", "top_cited", "open_source", "supplemental"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { goal?: unknown; planner?: unknown; message?: unknown };
    const goal = asString(body.goal, "").trim();
    const message = asString(body.message, "").trim();
    const currentPlanner = normalizePlanner(body.planner, new Date());

    if (!goal) {
      return NextResponse.json({ error: "Research goal is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Planner chat message is required." }, { status: 400 });
    }

    const now = new Date();
    const output = await generateText({
      system: createPlannerChatSystemPrompt(),
      user: createPlannerChatUserPrompt(goal, currentPlanner, message, now.toISOString()),
      validateText: validatePlannerChatOutput
    });
    const parsed = parseJsonObject(output);
    const assistantMessage = asString(parsed.assistantMessage, "已根据你的反馈更新 Planner 内容。");
    const planner = normalizePlanner(parsed.planner, now);

    return NextResponse.json({
      planner: {
        ...planner,
        chatMessages: [
          ...currentPlanner.chatMessages,
          { id: `planner-chat-user-${crypto.randomUUID().slice(0, 8)}`, role: "user", content: message, createdAt: formatDateTime(now) },
          { id: `planner-chat-assistant-${crypto.randomUUID().slice(0, 8)}`, role: "assistant", content: assistantMessage, createdAt: formatDateTime(now) }
        ]
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function createPlannerChatSystemPrompt() {
  return [
    "你是 Agentic Research Workspace 的 Planner Agent。",
    "你负责根据用户反馈持续完善 paper 收集、现有工作整合报告和可行 idea。",
    "只输出 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。",
    "论文链接、引用数、开源仓库如果不确定，必须写待核验，不要伪装成已核验事实。",
    "报告必须整合现状、路线、瓶颈、benchmark、可复现资源和空白点；idea 必须能落到最小实验。",
    "paper 必须支持比较和可视化：返回 latest/top_cited/open_source/supplemental 分类、citationCount、paperRelations 和 comparisonRows。"
  ].join("\n");
}

function createPlannerChatUserPrompt(goal: string, planner: PlannerBrief, message: string, isoNow: string) {
  return `
研究目标：${goal}
当前时间：${isoNow}
用户反馈：${message}

当前 Planner 内容：
${JSON.stringify(planner, null, 2)}

请返回以下 JSON：
{
  "assistantMessage": "给用户的一段简短回复，说明本轮更新了什么。",
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
        "evidence": "关系依据，不确定写待核验"
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
    "report": "更新后的现有工作整合报告。",
    "ideas": [
      {
        "id": "planner-idea-001",
        "title": "可行 idea 标题",
        "rationale": "为什么值得尝试",
        "firstExperiment": "第一步最小验证实验"
      }
    ],
    "chatMessages": []
  }
}

papers 必须尽量补充到 20 篇候选论文线索，其中 categories 覆盖 latest 最新 5 篇、top_cited 引用最多 5 篇、open_source 有 Git 的 5 篇，剩余 supplemental。
paperRelations 至少 8 条；comparisonRows 至少 5 行；ideas 至少 3 个。
`;
}

function validatePlannerChatOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);
    const planner = asRecord(parsed.planner);

    if (!Array.isArray(planner.papers)) {
      return "missing planner.papers array";
    }

    if (!asString(planner.report, "").trim()) {
      return "missing planner.report";
    }

    if (!Array.isArray(planner.ideas)) {
      return "missing planner.ideas array";
    }

    if (!Array.isArray(planner.paperRelations)) {
      return "missing planner.paperRelations array";
    }

    if (!Array.isArray(planner.comparisonRows)) {
      return "missing planner.comparisonRows array";
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");

    if (start < 0) {
      throw new Error("LLM response did not contain a JSON object.");
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];

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
        return JSON.parse(trimmed.slice(start, index + 1)) as Record<string, unknown>;
      }
    }

    throw new Error("LLM response contained an incomplete JSON object.");
  }
}

function normalizePlanner(value: unknown, now: Date): PlannerBrief {
  const record = asRecord(value);
  return {
    papers: normalizePapers(record.papers),
    paperRelations: normalizePaperRelations(record.paperRelations),
    comparisonRows: normalizeComparisonRows(record.comparisonRows),
    report: asString(record.report, "待继续整合现有工作报告。"),
    ideas: normalizeIdeas(record.ideas),
    chatMessages: normalizeChatMessages(record.chatMessages, now)
  };
}

function normalizePapers(value: unknown): PlannerPaper[] {
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
      categories: normalizePaperCategories(record.categories, index)
    } satisfies PlannerPaper;
  });
}

function normalizePaperCategories(value: unknown, index: number): PlannerPaperCategory[] {
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

function normalizePaperRelations(value: unknown): PlannerPaperRelation[] {
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

function normalizeComparisonRows(value: unknown): PlannerComparisonRow[] {
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

function normalizeIdeas(value: unknown): PlannerIdea[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `planner-idea-${index + 1}`),
      title: asString(record.title, `Planner idea ${index + 1}`),
      rationale: asString(record.rationale, "待补充依据。"),
      firstExperiment: asString(record.firstExperiment, "待补充最小实验。")
    } satisfies PlannerIdea;
  });
}

function normalizeChatMessages(value: unknown, now: Date): PlannerChatMessage[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `planner-chat-${index + 1}`),
      role: asString(record.role, "assistant") === "user" ? "user" : "assistant",
      content: asString(record.content, "待补充 Planner 对话。"),
      createdAt: asString(record.createdAt, formatDateTime(now))
    } satisfies PlannerChatMessage;
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

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", { hour12: false });
}