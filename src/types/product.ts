export type TaskStatus = "draft" | "running" | "blocked" | "completed" | "failed";

export type NodeStatus = "pending" | "running" | "done" | "failed" | "blocked" | "skipped";

export type BackendExecutionStatus = "running" | "success" | "warning" | "error";

export type BackendExecutionLog = {
  id: string;
  phase: string;
  status: BackendExecutionStatus;
  message: string;
  timestamp: string;
  elapsedMs: number;
};

export type CodingSpace = {
  name: string;
  path: string;
};

export type RemoteGpuUsage = {
  name: string;
  totalMemoryMb: number;
  usedMemoryMb: number;
  utilizationPct: number;
};

export type RemoteMachineSnapshot = {
  hostname: string;
  user: string;
  os: string;
  cwd: string;
  cpu: {
    model: string;
    cores: number;
    usagePct: number;
    loadAverage: string;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    availableMb: number;
    usedPct: number;
  };
  disk: {
    mount: string;
    totalMb: number;
    usedMb: number;
    availableMb: number;
    usedPct: number;
  };
  gpus: RemoteGpuUsage[];
  sampledAt: string;
};

export type RemoteCommandResult = {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  finishedAt: string;
};

export type PlannerPaperCategory = "latest" | "top_cited" | "open_source" | "supplemental";

export type PlannerPaper = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  citations: string;
  citationCount: number;
  summary: string;
  codeUrl: string;
  categories: PlannerPaperCategory[];
};

export type PlannerPaperRelation = {
  sourceId: string;
  targetId: string;
  relation: string;
  evidence: string;
};

export type PlannerComparisonRow = {
  axis: string;
  latest: string;
  topCited: string;
  openSource: string;
  takeaway: string;
};

export type PlannerIdea = {
  id: string;
  title: string;
  rationale: string;
  firstExperiment: string;
};

export type PlannerChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type PlannerBrief = {
  papers: PlannerPaper[];
  paperRelations: PlannerPaperRelation[];
  comparisonRows: PlannerComparisonRow[];
  report: string;
  ideas: PlannerIdea[];
  chatMessages: PlannerChatMessage[];
};

export type ResearchTask = {
  id: string;
  goal: string;
  domain: string;
  status: TaskStatus;
  activeNodeId: string;
  updatedAt: string;
  progress: number;
};

export type TaskNode = {
  id: string;
  label: string;
  agent: string;
  status: NodeStatus;
  summary: string;
  input: string;
  output: string;
  artifact: string;
};

export type Idea = {
  id: string;
  title: string;
  status: "candidate" | "selected" | "tested" | "rejected" | "promising";
  hypothesis: string;
  methodSketch: string;
  expectedEvidence: string[];
};

export type IdeaChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type Experiment = {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  codeVersion: string;
  config: Record<string, string | number | boolean>;
  metrics: Array<{ label: string; value: string; trend: "up" | "down" | "flat" }>;
  logs: string[];
};

export type AgentRun = {
  id: string;
  agent: string;
  status: NodeStatus;
  startedAt: string;
  message: string;
  toolCalls: string[];
};

export type MemoryItem = {
  id: string;
  type: "paper" | "idea" | "experiment" | "insight";
  title: string;
  description: string;
};

export type PaperDraft = {
  title: string;
  status: "not_started" | "drafting" | "ready";
  sections: Array<{ title: string; state: "empty" | "seeded" | "needs_evidence" }>;
  latexPreview: string;
};

export type EvaluationReport = {
  summary: string;
  improvement: "unknown" | "yes" | "no";
  nextActions: string[];
  risks: string[];
};

export type WorkspaceTask = {
  task: ResearchTask;
  planner: PlannerBrief;
  nodes: TaskNode[];
  ideas: Idea[];
  ideaChatMessages: IdeaChatMessage[];
  experiment: Experiment;
  evaluation: EvaluationReport;
  agentRuns: AgentRun[];
  memoryItems: MemoryItem[];
  paperDraft: PaperDraft;
  backendLogs: BackendExecutionLog[];
};

