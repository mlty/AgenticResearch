import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkspaceTask } from "@/types/product";

export type WorkspaceSaveResult = {
  savedAt: string;
  jsonPath: string;
  markdownPath: string;
};

type StoredWorkspaceFile = {
  savedAt?: string;
  workspace?: unknown;
};

const STORAGE_DIRECTORY_NAME = "research-workspaces";
const WORKSPACE_JSON_FILE = "workspace.json";
const WORKSPACE_MARKDOWN_FILE = "workspace.md";

export async function loadWorkspaceSnapshots(): Promise<WorkspaceTask[]> {
  await ensureStorageDirectory();

  const entries = await readdir(getStorageRoot(), { withFileTypes: true });
  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const jsonPath = path.join(getStorageRoot(), entry.name, WORKSPACE_JSON_FILE);

        try {
          const [file, fileStat] = await Promise.all([readStoredWorkspaceFile(jsonPath), stat(jsonPath)]);
          const workspace = normalizeStoredWorkspace(file);

          if (!workspace) {
            return null;
          }

          return {
            workspace,
            sortTime: Date.parse(workspace.task.updatedAt) || Date.parse(file.savedAt ?? "") || fileStat.mtimeMs
          };
        } catch {
          return null;
        }
      })
  );

  return loaded
    .filter((item): item is { workspace: WorkspaceTask; sortTime: number } => Boolean(item))
    .sort((first, second) => second.sortTime - first.sortTime)
    .map((item) => item.workspace);
}

export async function saveWorkspaceSnapshot(workspace: WorkspaceTask): Promise<WorkspaceSaveResult> {
  assertWorkspaceTask(workspace);

  const savedAt = new Date();
  const workspaceDirectory = path.join(getStorageRoot(), sanitizePathSegment(workspace.task.id));
  const jsonPath = path.join(workspaceDirectory, WORKSPACE_JSON_FILE);
  const markdownPath = path.join(workspaceDirectory, WORKSPACE_MARKDOWN_FILE);
  const payload = JSON.stringify({ savedAt: savedAt.toISOString(), workspace }, null, 2);
  const markdown = buildWorkspaceMarkdown(workspace, savedAt);

  await mkdir(workspaceDirectory, { recursive: true });
  await Promise.all([writeFile(jsonPath, `${payload}\n`, "utf8"), writeFile(markdownPath, markdown, "utf8")]);

  return {
    savedAt: formatDateTime(savedAt),
    jsonPath: toWorkspaceRelativePath(jsonPath),
    markdownPath: toWorkspaceRelativePath(markdownPath)
  };
}

function getStorageRoot() {
  return path.join(process.cwd(), STORAGE_DIRECTORY_NAME);
}

async function ensureStorageDirectory() {
  await mkdir(getStorageRoot(), { recursive: true });
}

async function readStoredWorkspaceFile(filePath: string): Promise<StoredWorkspaceFile> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as StoredWorkspaceFile;
}

function normalizeStoredWorkspace(value: StoredWorkspaceFile): WorkspaceTask | null {
  const candidate = value.workspace ?? value;
  return isWorkspaceTask(candidate) ? candidate : null;
}

function assertWorkspaceTask(value: unknown): asserts value is WorkspaceTask {
  if (!isWorkspaceTask(value)) {
    throw new Error("Workspace payload is missing task metadata.");
  }
}

function isWorkspaceTask(value: unknown): value is WorkspaceTask {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as { task?: { id?: unknown; goal?: unknown }; nodes?: unknown; ideas?: unknown; planner?: unknown };
  return Boolean(
    record.task &&
      typeof record.task.id === "string" &&
      record.task.id.trim() &&
      typeof record.task.goal === "string" &&
      Array.isArray(record.nodes) &&
      Array.isArray(record.ideas) &&
      record.planner &&
      typeof record.planner === "object"
  );
}

function buildWorkspaceMarkdown(workspace: WorkspaceTask, savedAt: Date) {
  const selectedIdea = workspace.ideas.find((idea) => idea.status === "selected") ?? null;
  const sections = [
    `# ${workspace.task.goal}`,
    [
      `- Task ID: ${workspace.task.id}`,
      `- Domain: ${workspace.task.domain}`,
      `- Status: ${workspace.task.status}`,
      `- Progress: ${workspace.task.progress}%`,
      `- Updated: ${workspace.task.updatedAt}`,
      `- Saved copy: ${formatDateTime(savedAt)}`
    ].join("\n"),
    "## Current Selection",
    selectedIdea
      ? [`- Idea: ${selectedIdea.title}`, `- Hypothesis: ${selectedIdea.hypothesis}`, `- Method: ${selectedIdea.methodSketch}`].join("\n")
      : "- Idea: None selected",
    "## Task Graph",
    workspace.nodes
      .map((node) => [`### ${node.label}`, `- Agent: ${node.agent}`, `- Status: ${node.status}`, `- Artifact: ${node.artifact || "None"}`, node.summary].join("\n"))
      .join("\n\n"),
    "## Planner Report",
    workspace.planner.report || "No planner report saved.",
    "## Papers",
    buildPapersTable(workspace),
    "## Feasible Ideas",
    workspace.ideas
      .map((idea) => [`### ${idea.title}`, `- Status: ${idea.status}`, `- Hypothesis: ${idea.hypothesis}`, `- Method: ${idea.methodSketch}`, formatList("Expected evidence", idea.expectedEvidence)].join("\n"))
      .join("\n\n") || "No ideas saved.",
    "## Idea Chat",
    (workspace.ideaChatMessages ?? []).map((message) => `- ${message.createdAt} [${message.role}] ${message.content}`).join("\n") || "No idea chat messages saved.",
    "## Coding Plan",
    workspace.nodes.find((node) => node.id === "coding")?.output || "No coding plan saved yet.",
    "## Experiment",
    [
      `- Name: ${workspace.experiment.name}`,
      `- Status: ${workspace.experiment.status}`,
      `- Code version: ${workspace.experiment.codeVersion}`,
      "### Config",
      formatKeyValueList(workspace.experiment.config),
      "### Logs",
      workspace.experiment.logs.length > 0 ? fenced(workspace.experiment.logs.join("\n"), "text") : "No experiment logs saved."
    ].join("\n"),
    "## Evaluation",
    [workspace.evaluation.summary, formatList("Next actions", workspace.evaluation.nextActions), formatList("Risks", workspace.evaluation.risks)].join("\n\n"),
    "## Memory Items",
    workspace.memoryItems.map((item) => `- [${item.type}] ${item.title}: ${item.description}`).join("\n") || "No memory items saved.",
    "## Paper Draft",
    fenced(workspace.paperDraft.latexPreview || "No LaTeX draft saved.", "tex"),
    "## Backend Logs",
    workspace.backendLogs.map((log) => `- ${log.timestamp} [${log.status}] ${log.phase}: ${log.message}`).join("\n") || "No backend logs saved."
  ];

  return `${sections.join("\n\n")}\n`;
}

function buildPapersTable(workspace: WorkspaceTask) {
  if (workspace.planner.papers.length === 0) {
    return "No papers saved.";
  }

  const rows = workspace.planner.papers.map((paper) =>
    [paper.categories.join(", ") || "supplemental", paper.title, paper.publishedAt, paper.citations, paper.url, paper.codeUrl]
      .map(escapeTableCell)
      .join(" | ")
  );

  return ["| Category | Title | Published | Citations | Paper | Code |", "| --- | --- | --- | --- | --- | --- |", ...rows.map((row) => `| ${row} |`)].join("\n");
}

function formatList(title: string, items: string[]) {
  if (items.length === 0) {
    return `### ${title}\n- None`;
  }

  return [`### ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
}

function formatKeyValueList(value: Record<string, string | number | boolean>) {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "- None";
  }

  return entries.map(([key, item]) => `- ${key}: ${String(item)}`).join("\n");
}

function fenced(value: string, language: string) {
  const fence = value.includes("```") ? "````" : "```";
  return `${fence}${language}\n${value}\n${fence}`;
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "None";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || `workspace-${Date.now()}`;
}

function toWorkspaceRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function formatDateTime(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}