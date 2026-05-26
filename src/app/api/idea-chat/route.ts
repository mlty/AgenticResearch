import { NextRequest, NextResponse } from "next/server";

import { generateText } from "@/lib/llm-client";
import type { Idea, IdeaChatMessage, PlannerBrief } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDEA_STATUSES: Idea["status"][] = ["candidate", "selected", "tested", "rejected", "promising"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      goal?: unknown;
      domain?: unknown;
      planner?: unknown;
      ideas?: unknown;
      ideaChatMessages?: unknown;
      selectedIdeaId?: unknown;
      message?: unknown;
    };
    const goal = asString(body.goal, "").trim();
    const domain = asString(body.domain, "待识别研究领域");
    const message = asString(body.message, "").trim();
    const currentIdeas = normalizeIdeas(body.ideas);
    const currentMessages = normalizeIdeaChatMessages(body.ideaChatMessages, new Date());
    const selectedIdeaId = asString(body.selectedIdeaId, currentIdeas.find((idea) => idea.status === "selected")?.id ?? "");
    const planner = normalizePlannerBrief(body.planner);

    if (!goal) {
      return NextResponse.json({ error: "Research goal is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Idea chat message is required." }, { status: 400 });
    }

    const now = new Date();
    const output = await generateText({
      system: createIdeaChatSystemPrompt(),
      user: createIdeaChatUserPrompt({ goal, domain, planner, currentIdeas, currentMessages, selectedIdeaId, message, isoNow: now.toISOString() }),
      validateText: validateIdeaChatOutput
    });
    const parsed = parseJsonObject(output);
    const assistantMessage = asString(parsed.assistantMessage, "已根据你的反馈更新候选 idea。");
    const nextIdeas = normalizeIdeas(parsed.ideas);
    const nextSelectedIdeaId = asString(parsed.selectedIdeaId, nextIdeas.find((idea) => idea.status === "selected")?.id ?? selectedIdeaId);
    const ideas = applySelectedIdea(nextIdeas.length > 0 ? nextIdeas : currentIdeas, nextSelectedIdeaId);

    return NextResponse.json({
      ideas,
      selectedIdeaId: ideas.find((idea) => idea.status === "selected")?.id ?? "",
      ideaChatMessages: [
        ...currentMessages,
        { id: `idea-chat-user-${crypto.randomUUID().slice(0, 8)}`, role: "user", content: message, createdAt: formatDateTime(now) },
        { id: `idea-chat-assistant-${crypto.randomUUID().slice(0, 8)}`, role: "assistant", content: assistantMessage, createdAt: formatDateTime(now) }
      ] satisfies IdeaChatMessage[]
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function createIdeaChatSystemPrompt() {
  return [
    "你是 Agentic Research Workspace 的 Idea Agent。",
    "你负责通过对话持续编辑候选 idea：新增、删除、合并、拆分、改写、打分、选择一个 idea，并把它收敛成可执行的最小实验。",
    "只输出 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。",
    "不要编造已经完成的实验结果。expectedEvidence 只能写待验证证据、指标、消融或日志需求。",
    "每个 idea 必须包含清晰 hypothesis、methodSketch 和 expectedEvidence；如果用户要求更大胆，可以保留风险但仍要可落地。",
    "status 只能是 candidate、selected、tested、rejected、promising。除非用户明确拒绝所有 idea，否则最多一个 idea 使用 selected。"
  ].join("\n");
}

function createIdeaChatUserPrompt({
  goal,
  domain,
  planner,
  currentIdeas,
  currentMessages,
  selectedIdeaId,
  message,
  isoNow
}: {
  goal: string;
  domain: string;
  planner: PlannerBrief;
  currentIdeas: Idea[];
  currentMessages: IdeaChatMessage[];
  selectedIdeaId: string;
  message: string;
  isoNow: string;
}) {
  return `
研究目标：${goal}
领域：${domain}
当前时间：${isoNow}
当前选中 idea：${selectedIdeaId || "无"}

Planner 摘要：
${JSON.stringify({ report: planner.report, plannerIdeas: planner.ideas, comparisonRows: planner.comparisonRows }, null, 2)}

当前候选 idea：
${JSON.stringify(currentIdeas, null, 2)}

近期 Idea 对话：
${JSON.stringify(currentMessages.slice(-8), null, 2)}

用户消息：${message}

请返回以下 JSON：
{
  "assistantMessage": "给用户的一段简短回复，说明本轮如何修改了 idea。",
  "selectedIdeaId": "被选中的 idea id；如果没有选中则为空字符串。",
  "ideas": [
    {
      "id": "idea-001",
      "title": "idea 标题",
      "status": "candidate",
      "hypothesis": "可验证研究假设",
      "methodSketch": "最小实现与实验方法草图",
      "expectedEvidence": ["需要看到的指标、日志、消融或定性证据"]
    }
  ]
}

要求：
- 保留用户没有要求删除的有效 idea。
- 可以重写 title、hypothesis、methodSketch、expectedEvidence 来提高可执行性。
- 如果新增 idea，请使用稳定 id，例如 idea-${Date.now()}-1；不要复用已有不同 idea 的 id。
- 如果用户要求选择某个 idea，请把它的 status 设为 selected，并把其他 selected 改为 candidate 或 promising。
- 返回 2 到 6 个候选 idea，除非用户明确要求其他数量。
`;
}

function validateIdeaChatOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);

    if (!Array.isArray(parsed.ideas)) {
      return "missing ideas array";
    }

    if (!asString(parsed.assistantMessage, "").trim()) {
      return "missing assistantMessage";
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
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `idea-chat-${index + 1}`),
      role: asEnum(record.role, ["user", "assistant"], "assistant"),
      content: asString(record.content, "待补充 Idea 对话。"),
      createdAt: asString(record.createdAt, formatDateTime(now))
    } satisfies IdeaChatMessage;
  });
}

function normalizePlannerBrief(value: unknown): PlannerBrief {
  const record = asRecord(value);
  return {
    papers: [],
    paperRelations: [],
    comparisonRows: normalizeComparisonRows(record.comparisonRows),
    report: asString(record.report, "待补充 Planner 报告。"),
    ideas: normalizePlannerIdeas(record.ideas),
    chatMessages: []
  };
}

function normalizePlannerIdeas(value: unknown): PlannerBrief["ideas"] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      id: asString(record.id, `planner-idea-${index + 1}`),
      title: asString(record.title, `Planner idea ${index + 1}`),
      rationale: asString(record.rationale, "待补充可行性依据。"),
      firstExperiment: asString(record.firstExperiment, "待补充最小验证实验。")
    };
  });
}

function normalizeComparisonRows(value: unknown): PlannerBrief["comparisonRows"] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const record = asRecord(item);
    return {
      axis: asString(record.axis, `Comparison axis ${index + 1}`),
      latest: asString(record.latest, "待补充"),
      topCited: asString(record.topCited, "待补充"),
      openSource: asString(record.openSource, "待补充"),
      takeaway: asString(record.takeaway, "待补充")
    };
  });
}

function applySelectedIdea(ideas: Idea[], selectedIdeaId: string) {
  const hasSelectedIdea = selectedIdeaId && ideas.some((idea) => idea.id === selectedIdeaId);
  let selectedSeen = false;

  return ideas.map((idea) => {
    if (hasSelectedIdea) {
      return idea.id === selectedIdeaId ? { ...idea, status: "selected" as const } : idea.status === "selected" ? { ...idea, status: "candidate" as const } : idea;
    }

    if (idea.status !== "selected") {
      return idea;
    }

    if (!selectedSeen) {
      selectedSeen = true;
      return idea;
    }

    return { ...idea, status: "candidate" as const };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", { hour12: false });
}
