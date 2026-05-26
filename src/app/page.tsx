"use client";

import {
  Activity,
  AlertCircle,
  Archive,
  Beaker,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronRight,
  CirclePause,
  Clock3,
  Cpu,
  FileText,
  FlaskConical,
  FolderOpen,
  GitBranch,
  HardDrive,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  Sparkles,
  TerminalSquare,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  BackendExecutionLog,
  CodingSpace,
  Idea,
  IdeaChatMessage,
  RemoteCommandResult,
  RemoteMachineSnapshot,
  TaskNode,
  WorkspaceTask
} from "@/types/product";

type ResearchTaskStreamEvent =
  | { type: "log"; entry: BackendExecutionLog }
  | { type: "workspace"; workspace: WorkspaceTask; backendLogs?: BackendExecutionLog[] }
  | { type: "error"; error: string; backendLogs?: BackendExecutionLog[] };

type RemoteForm = {
  address: string;
  username: string;
  port: string;
  basePath: string;
};

type RemoteStatus = "idle" | "connecting" | "connected" | "refreshing" | "running" | "error";

type RemoteServerResponse = {
  machine?: RemoteMachineSnapshot;
  spaces?: CodingSpace[];
  result?: RemoteCommandResult;
  error?: string;
};

type RemoteCommandStreamEvent =
  | { type: "start"; message: string; elapsedMs: number }
  | { type: "stdout"; chunk: string; elapsedMs: number }
  | { type: "stderr"; chunk: string; elapsedMs: number }
  | { type: "result"; result: RemoteCommandResult }
  | { type: "error"; error: string; elapsedMs: number };

type RemoteStreamLine = {
  id: string;
  stream: "system" | "stdout" | "stderr";
  text: string;
  elapsedMs: number;
};

type RemoteTaskProgress = {
  percent: number;
  label: string;
  tone: "idle" | "running" | "success" | "error";
};

type PlannerChatResponse = {
  planner?: WorkspaceTask["planner"];
  error?: string;
};

type IdeaChatResponse = {
  ideas?: Idea[];
  ideaChatMessages?: IdeaChatMessage[];
  selectedIdeaId?: string;
  error?: string;
};

type ResearchTaskJsonPayload = {
  workspace?: WorkspaceTask;
  error?: string;
  backendLogs?: BackendExecutionLog[];
};

type WorkspaceArchiveResponse = {
  workspaces?: WorkspaceTask[];
  storageDir?: string;
  error?: string;
};

type WorkspaceSaveResponse = {
  savedAt?: string;
  jsonPath?: string;
  markdownPath?: string;
  error?: string;
};

type WorkspaceArchiveStatus = {
  state: "loading" | "ready" | "saving" | "saved" | "error";
  message: string;
  markdownPath?: string;
};

type SurveyGithubRepository = {
  id: string;
  name: string;
  url: string;
  sourcePaperTitle: string;
};

type CodingPlanSetup = {
  machine: RemoteMachineSnapshot;
  space: CodingSpace;
  baseRepo: SurveyGithubRepository | null;
};

type CodingChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  command?: string;
  pendingCommand?: string;
  result?: RemoteCommandResult;
};

type RemoteCodingInstruction = {
  command?: string;
  response?: string;
  needsPlanning?: boolean;
  autoExecutePlannedCommand?: boolean;
};

type RemoteCommandPlanResponse = {
  analysis?: string;
  failureType?: string;
  strategy?: string;
  agentPlan?: string[];
  deepSearchPlan?: string[];
  verifyChecklist?: string[];
  nextIfFails?: string;
  command?: string;
  explanation?: string;
  error?: string;
};

type PlannerPaperForDisplay = WorkspaceTask["planner"]["papers"][number];
type PlannerPaperDisplayCategory = PlannerPaperForDisplay["categories"][number];

const NO_BASE_REPO_VALUE = "__none__";
const AUTO_REPAIR_MAX_ATTEMPTS = 3;

const statusLabels: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
  pending: "Pending",
  done: "Done",
  skipped: "Skipped",
  queued: "Queued",
  not_started: "Not started",
  drafting: "Drafting",
  ready: "Ready"
};

const nodeStatusOrder = ["planner", "idea", "coding", "experiment", "evaluation", "paper"];

export default function Home() {
  const hasLoadedArchiveRef = useRef(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendLogs, setBackendLogs] = useState<BackendExecutionLog[]>([]);
  const [remoteForm, setRemoteForm] = useState<RemoteForm>({ address: "", username: "", port: "22", basePath: "~" });
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>("idle");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteMachine, setRemoteMachine] = useState<RemoteMachineSnapshot | null>(null);
  const [codingSpaces, setCodingSpaces] = useState<CodingSpace[]>([]);
  const [selectedCodingSpace, setSelectedCodingSpace] = useState<CodingSpace | null>(null);
  const [remoteCommand, setRemoteCommand] = useState("pwd && ls -la");
  const [remoteCommandResult, setRemoteCommandResult] = useState<RemoteCommandResult | null>(null);
  const [remoteStreamLines, setRemoteStreamLines] = useState<RemoteStreamLine[]>([]);
  const [isRemoteLive, setIsRemoteLive] = useState(false);
  const [isAutoRepairEnabled, setIsAutoRepairEnabled] = useState(true);
  const [plannerChatInput, setPlannerChatInput] = useState("");
  const [isPlannerChatting, setIsPlannerChatting] = useState(false);
  const [plannerChatError, setPlannerChatError] = useState<string | null>(null);
  const [ideaChatInput, setIdeaChatInput] = useState("");
  const [isIdeaChatting, setIsIdeaChatting] = useState(false);
  const [ideaChatError, setIdeaChatError] = useState<string | null>(null);
  const [baseRepoSelections, setBaseRepoSelections] = useState<Record<string, string>>({});
  const [codingChatMessages, setCodingChatMessages] = useState<Record<string, CodingChatMessage[]>>({});
  const [codingChatInput, setCodingChatInput] = useState("");
  const [isCodingChatRunning, setIsCodingChatRunning] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<WorkspaceArchiveStatus>({
    state: "loading",
    message: "正在加载已保存的研究工作。"
  });

  const selectedWorkspace = workspaces.find((workspace) => workspace.task.id === selectedTaskId) ?? null;
  const selectedTask = selectedWorkspace?.task ?? null;
  const selectedNode = selectedWorkspace?.nodes.find((node) => node.id === selectedNodeId) ?? selectedWorkspace?.nodes[0] ?? null;
  const visibleBackendLogs = isExecuting ? backendLogs : selectedWorkspace?.backendLogs ?? backendLogs;
  const sortedNodes = useMemo(() => {
    const nodes = selectedWorkspace?.nodes ?? [];
    return [...nodes].sort((a, b) => getNodeOrder(a.id) - getNodeOrder(b.id));
  }, [selectedWorkspace]);
  const surveyGithubRepositories = useMemo(
    () => getSurveyGithubRepositories(selectedWorkspace?.planner.papers ?? []),
    [selectedWorkspace?.planner.papers]
  );
  const selectedBaseRepoValue = selectedTaskId ? baseRepoSelections[selectedTaskId] ?? NO_BASE_REPO_VALUE : NO_BASE_REPO_VALUE;
  const effectiveBaseRepoValue = surveyGithubRepositories.some((repo) => repo.url === selectedBaseRepoValue)
    ? selectedBaseRepoValue
    : NO_BASE_REPO_VALUE;
  const selectedBaseRepo = surveyGithubRepositories.find((repo) => repo.url === effectiveBaseRepoValue) ?? null;
  const visibleCodingChatMessages = selectedTaskId ? codingChatMessages[selectedTaskId] ?? [] : [];

  useEffect(() => {
    if (hasLoadedArchiveRef.current) {
      return;
    }

    hasLoadedArchiveRef.current = true;
    void loadArchivedWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedNode?.id !== "coding" || !isRemoteLive || !remoteMachine || remoteStatus === "connecting" || remoteStatus === "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshRemoteServer(true);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [isRemoteLive, remoteMachine, remoteStatus, remoteForm.address, remoteForm.username, remoteForm.port, remoteForm.basePath, selectedCodingSpace?.path, selectedNode?.id]);

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await executeResearchTask(goal);
  }

  async function loadArchivedWorkspaces() {
    setArchiveStatus({ state: "loading", message: "正在加载已保存的研究工作。" });

    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      const payload = (await response.json()) as WorkspaceArchiveResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load saved workspaces.");
      }

      const savedWorkspaces = payload.workspaces ?? [];

      if (savedWorkspaces.length === 0) {
        setArchiveStatus({ state: "ready", message: "暂无已保存工作；新建或编辑后会自动写入本地副本。" });
        return;
      }

      setWorkspaces(savedWorkspaces);
      setArchiveStatus({
        state: "ready",
        message: `已从 ${payload.storageDir ?? "research-workspaces"} 加载 ${savedWorkspaces.length} 个研究工作，可从左侧选择继续编辑。`
      });
    } catch (caughtError) {
      setArchiveStatus({ state: "error", message: caughtError instanceof Error ? caughtError.message : String(caughtError) });
    }
  }

  async function persistWorkspace(workspace: WorkspaceTask) {
    setArchiveStatus({ state: "saving", message: "正在保存 JSON 状态和 Markdown 副本。" });

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace })
      });
      const payload = (await response.json()) as WorkspaceSaveResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save workspace.");
      }

      setArchiveStatus({
        state: "saved",
        message: `已保存 ${workspace.task.id}${payload.savedAt ? ` · ${payload.savedAt}` : ""}`,
        markdownPath: payload.markdownPath
      });
    } catch (caughtError) {
      setArchiveStatus({ state: "error", message: caughtError instanceof Error ? caughtError.message : String(caughtError) });
    }
  }

  async function handleRerunTask() {
    if (!selectedTask) {
      return;
    }

    await executeResearchTask(selectedTask.goal, selectedTask.id);
  }

  function handleSelectIdea(ideaId: string) {
    if (!selectedTaskId || !selectedWorkspace) {
      return;
    }

    const nextWorkspace = selectWorkspaceIdea(selectedWorkspace, ideaId);

    if (nextWorkspace === selectedWorkspace) {
      return;
    }

    setWorkspaces((current) =>
      current.map((workspace) => (workspace.task.id === selectedTaskId ? nextWorkspace : workspace))
    );
    setSelectedNodeId("coding");
    void persistWorkspace(nextWorkspace);
  }

  function handleAdvanceCoding() {
    if (!selectedTaskId || !selectedWorkspace) {
      return;
    }

    if (!remoteMachine || !selectedCodingSpace) {
      setRemoteError("Please connect a development machine and select a coding space first.");
      return;
    }

    const setup: CodingPlanSetup = { machine: remoteMachine, space: selectedCodingSpace, baseRepo: selectedBaseRepo };
    const nextWorkspace = advanceWorkspaceCoding(selectedWorkspace, setup);

    if (nextWorkspace === selectedWorkspace) {
      return;
    }

    setWorkspaces((current) =>
      current.map((workspace) => (workspace.task.id === selectedTaskId ? nextWorkspace : workspace))
    );
    setSelectedNodeId("coding");
    void persistWorkspace(nextWorkspace);
  }

  function updateRemoteForm(field: keyof RemoteForm, value: string) {
    setRemoteForm((current) => ({ ...current, [field]: value }));
  }

  function handleBaseRepoChange(value: string) {
    if (!selectedTaskId) {
      return;
    }

    setBaseRepoSelections((current) => ({ ...current, [selectedTaskId]: value }));
  }

  async function handleRemoteConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await connectRemoteServer();
  }

  async function connectRemoteServer() {
    setRemoteStatus("connecting");
    setRemoteError(null);
    setRemoteCommandResult(null);

    try {
      const payload = await requestRemoteServer({ action: "connect" });
      const spaces = payload.spaces ?? [];
      setRemoteMachine(payload.machine ?? null);
      setCodingSpaces(spaces);
      setSelectedCodingSpace(spaces[0] ?? null);
      setRemoteStatus("connected");
      setIsRemoteLive(true);
    } catch (caughtError) {
      setRemoteStatus("error");
      setRemoteError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setIsRemoteLive(false);
    }
  }

  async function refreshRemoteServer(silent = false) {
    if (!remoteForm.address.trim()) {
      return;
    }

    if (!silent) {
      setRemoteStatus("refreshing");
    }

    setRemoteError(null);

    try {
      const payload = await requestRemoteServer({ action: "refresh", cwd: selectedCodingSpace?.path });
      setRemoteMachine(payload.machine ?? null);

      if (payload.spaces) {
        setCodingSpaces(payload.spaces);
        setSelectedCodingSpace((current) => current ?? payload.spaces?.[0] ?? null);
      }

      setRemoteStatus("connected");
    } catch (caughtError) {
      setRemoteStatus("error");
      setRemoteError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function runRemoteDevelopmentCommand() {
    if (!selectedCodingSpace) {
      setRemoteError("Please select a coding space first.");
      return;
    }

    setRemoteStatus("running");
    setRemoteError(null);

    try {
      const result = await streamRemoteServerCommand(remoteCommand, selectedCodingSpace.path, 600000);
      setRemoteCommandResult(result);
      setRemoteStatus("connected");
      await refreshRemoteServer(true);
    } catch (caughtError) {
      setRemoteStatus("error");
      setRemoteError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleCodingChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTaskId || !selectedWorkspace) {
      return;
    }

    const message = codingChatInput.trim();

    if (!message || isCodingChatRunning) {
      return;
    }

    if (!remoteMachine || !selectedCodingSpace) {
      setRemoteError("Please connect a development machine and select a coding space first.");
      return;
    }

    const selectedIdea = selectedWorkspace.ideas.find((idea) => idea.status === "selected") ?? null;
    const instruction = createRemoteCodingInstruction(message, selectedBaseRepo, selectedIdea);
    appendCodingChatMessage(selectedTaskId, { id: createClientId("coding-user"), role: "user", content: message });
    setCodingChatInput("");

    if (instruction.needsPlanning) {
      await planRemoteCodingCommand(selectedTaskId, message, selectedBaseRepo, selectedIdea, selectedCodingSpace, instruction.autoExecutePlannedCommand);
      return;
    }

    if (!instruction.command) {
      appendCodingChatMessage(selectedTaskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: instruction.response ?? "我还不能把这条指令转换成安全的远程命令。可以用 `$ 命令` 直接执行 shell。"
      });
      return;
    }

    await executeRemoteCodingCommand(selectedTaskId, instruction.command);
  }

  async function planRemoteCodingCommand(
    taskId: string,
    message: string,
    baseRepo: SurveyGithubRepository | null,
    selectedIdea: Idea | null,
    selectedSpace: CodingSpace,
    autoExecute = false
  ) {
    setIsCodingChatRunning(true);
    setRemoteError(null);

    try {
      const response = await fetch("/api/remote-command-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          cwd: selectedSpace.path,
          ideaTitle: selectedIdea?.title,
          ideaSketch: selectedIdea?.methodSketch,
          baseRepoName: baseRepo?.name,
          baseRepoUrl: baseRepo?.url
        })
      });
      const payload = (await response.json()) as RemoteCommandPlanResponse;

      if (!response.ok || !payload.command) {
        throw new Error(payload.error ?? "Failed to plan remote command.");
      }

      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: formatRemotePlanMessage(payload, autoExecute ? "我已完成 agentic 安装计划，将自动执行。" : "我已生成远程命令草案，请确认后执行。"),
        command: autoExecute ? payload.command : undefined,
        pendingCommand: autoExecute ? undefined : payload.command
      });

      if (autoExecute) {
        await executeRemoteCodingCommand(taskId, payload.command);
      }
    } catch (caughtError) {
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: `生成远程命令草案失败：${caughtError instanceof Error ? caughtError.message : String(caughtError)}。可以用 \`$ 命令\` 直接执行 shell。`
      });
    } finally {
      setIsCodingChatRunning(false);
    }
  }

  async function executeRemoteCodingCommand(taskId: string, command: string, sourceMessageId?: string) {
    if (!selectedCodingSpace) {
      setRemoteError("Please select a coding space first.");
      return;
    }

    const activeCodingSpace = selectedCodingSpace;
    const activeBaseRepo = selectedBaseRepo;
    const shouldAutoRepair = isAutoRepairEnabled;

    if (sourceMessageId) {
      clearPendingCodingCommand(taskId, sourceMessageId);
    }

    setIsCodingChatRunning(true);
    setRemoteStatus("running");
    setRemoteError(null);

    try {
      const result = await streamRemoteServerCommand(command, activeCodingSpace.path, 600000);
      setRemoteCommandResult(result);
      setRemoteStatus("connected");

      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: result.exitCode === 0
          ? `远程命令执行完成，exit ${result.exitCode}。`
          : shouldAutoRepair
            ? `远程命令执行失败，exit ${result.exitCode}。Auto repair mode 已启动，最多自动重试 ${AUTO_REPAIR_MAX_ATTEMPTS} 次。`
            : `远程命令执行失败，exit ${result.exitCode}。我会根据日志生成一个安全修复草案。`,
        command,
        result
      });

      if (result.exitCode !== 0) {
        if (shouldAutoRepair) {
          await runAutoRepairLoop(taskId, command, result, activeCodingSpace, activeBaseRepo);
        } else {
          await planRemoteRepairCommand(taskId, command, result, activeCodingSpace);
        }
      }

      await refreshRemoteServer(true);
    } catch (caughtError) {
      const messageText = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setRemoteStatus("error");
      setRemoteError(messageText);
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: `远程执行失败：${messageText}`,
        command
      });
    } finally {
      setIsCodingChatRunning(false);
    }
  }

  async function runAutoRepairLoop(
    taskId: string,
    initialFailedCommand: string,
    initialResult: RemoteCommandResult,
    activeCodingSpace: CodingSpace,
    activeBaseRepo: SurveyGithubRepository | null
  ) {
    let failedCommand = initialFailedCommand;
    let failedResult = initialResult;

    for (let attempt = 1; attempt <= AUTO_REPAIR_MAX_ATTEMPTS; attempt += 1) {
      let repairPlan: RemoteCommandPlanResponse;

      try {
        repairPlan = await requestRemoteRepairCommand(activeCodingSpace, failedCommand, failedResult, attempt);
      } catch (caughtError) {
        const messageText = caughtError instanceof Error ? caughtError.message : String(caughtError);
        appendCodingChatMessage(taskId, {
          id: createClientId("coding-assistant"),
          role: "assistant",
          content: `Auto repair 第 ${attempt}/${AUTO_REPAIR_MAX_ATTEMPTS} 轮无法生成修复命令：${messageText}。已停止自动修复。`
        });
        setRemoteError(messageText);
        return;
      }

      if (!repairPlan.command) {
        appendCodingChatMessage(taskId, {
          id: createClientId("coding-assistant"),
          role: "assistant",
          content: `Auto repair 第 ${attempt}/${AUTO_REPAIR_MAX_ATTEMPTS} 轮没有得到可执行命令。已停止自动修复。`
        });
        return;
      }

      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: formatRemotePlanMessage(repairPlan, `Auto repair 第 ${attempt}/${AUTO_REPAIR_MAX_ATTEMPTS} 轮：执行最小安全修复，然后自动 verify。`, attempt),
        command: repairPlan.command
      });

      const repairResult = await runRemoteCommandForAutoRepair(repairPlan.command, activeCodingSpace);
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: repairResult.exitCode === 0 ? `Auto repair 第 ${attempt} 轮修复命令完成，开始 verify。` : `Auto repair 第 ${attempt} 轮修复命令失败，exit ${repairResult.exitCode}。`,
        command: repairPlan.command,
        result: repairResult
      });

      if (repairResult.exitCode !== 0) {
        failedCommand = repairPlan.command;
        failedResult = repairResult;
        continue;
      }

      const verifyCommand = createAutoRepairVerifyCommand(activeBaseRepo);
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: `Auto repair 第 ${attempt} 轮正在自动 verify。`,
        command: verifyCommand
      });

      const verifyResult = await runRemoteCommandForAutoRepair(verifyCommand, activeCodingSpace);
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: verifyResult.exitCode === 0 ? `Auto repair 成功：第 ${attempt} 轮修复后 verify 通过。` : `Auto repair 第 ${attempt} 轮 verify 失败，exit ${verifyResult.exitCode}。`,
        command: verifyCommand,
        result: verifyResult
      });

      if (verifyResult.exitCode === 0) {
        setRemoteError(null);
        return;
      }

      failedCommand = verifyCommand;
      failedResult = verifyResult;
    }

    appendCodingChatMessage(taskId, {
      id: createClientId("coding-assistant"),
      role: "assistant",
      content: `Auto repair 已连续失败 ${AUTO_REPAIR_MAX_ATTEMPTS} 次并停止。最终原因：${summarizeRemoteFailure(failedResult)}`,
      command: failedCommand,
      result: failedResult
    });
    setRemoteError(`Auto repair stopped after ${AUTO_REPAIR_MAX_ATTEMPTS} failed attempts.`);
  }

  async function runRemoteCommandForAutoRepair(command: string, activeCodingSpace: CodingSpace): Promise<RemoteCommandResult> {
    setRemoteStatus("running");

    try {
      const result = await streamRemoteServerCommand(command, activeCodingSpace.path, 600000);
      setRemoteCommandResult(result);
      setRemoteStatus("connected");
      return result;
    } catch (caughtError) {
      const messageText = caughtError instanceof Error ? caughtError.message : String(caughtError);
      const result = createFailedRemoteCommandResult(command, activeCodingSpace.path, messageText);
      setRemoteCommandResult(result);
      setRemoteStatus("error");
      setRemoteError(messageText);
      appendRemoteStreamLine({ stream: "stderr", text: messageText, elapsedMs: 0 });
      return result;
    }
  }

  async function planRemoteRepairCommand(taskId: string, failedCommand: string, result: RemoteCommandResult, selectedSpace: CodingSpace) {
    try {
      const payload = await requestRemoteRepairCommand(selectedSpace, failedCommand, result);

      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: formatRemotePlanMessage(payload, "已根据失败日志生成安全修复命令草案，请确认后执行。"),
        pendingCommand: payload.command
      });
    } catch (caughtError) {
      appendCodingChatMessage(taskId, {
        id: createClientId("coding-assistant"),
        role: "assistant",
        content: `自动生成修复草案失败：${caughtError instanceof Error ? caughtError.message : String(caughtError)}。可以把错误日志发给我继续分析。`
      });
    }
  }

  async function requestRemoteRepairCommand(selectedSpace: CodingSpace, failedCommand: string, result: RemoteCommandResult, attempt?: number): Promise<RemoteCommandPlanResponse> {
    const response = await fetch("/api/remote-command-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: attempt
          ? `Auto repair mode 第 ${attempt}/${AUTO_REPAIR_MAX_ATTEMPTS} 轮：根据上一次失败的远程命令和日志，生成一个最小、安全、可回滚的修复命令。命令必须只影响当前 coding space，禁止 sudo/apt/rm -rf/系统路径；修复后系统会自动运行 verify。如果上一次 exit code 是 32 或日志包含 No expected conda env found，优先在 $AGENTIC_CODING_SPACE/.conda/envs 下创建或修复 agentic-<project> conda env，并执行项目 README/setup/environment/requirements 中的安装步骤。`
          : "根据上一次失败的远程命令和日志，生成一个最小、安全、可回滚的修复命令；修复后继续执行 verify，不要使用 sudo 或系统包管理器。",
        cwd: selectedSpace.path,
        failedCommand,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(-12000),
        stderr: result.stderr.slice(-12000)
      })
    });
    const payload = (await response.json()) as RemoteCommandPlanResponse;

    if (!response.ok || !payload.command) {
      throw new Error(payload.error ?? "Failed to plan repair command.");
    }

    return payload;
  }

  async function streamRemoteServerCommand(command: string, cwd: string, timeoutMs: number): Promise<RemoteCommandResult> {
    setRemoteStreamLines([]);
    const response = await fetch("/api/remote-server?stream=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson"
      },
      body: JSON.stringify({
        ...remoteForm,
        port: remoteForm.port ? Number(remoteForm.port) : undefined,
        cwd,
        command,
        timeoutMs,
        action: "run"
      })
    });

    return readRemoteCommandStreamResponse(response);
  }

  async function readRemoteCommandStreamResponse(response: Response): Promise<RemoteCommandResult> {
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.body || !contentType.includes("application/x-ndjson")) {
      const payload = (await response.json().catch(() => ({}))) as RemoteServerResponse;
      throw new Error(payload.error ?? `Remote command failed with HTTP ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const streamState: { result: RemoteCommandResult | null; error: string | null } = { result: null, error: null };

    const handleLine = (line: string) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return;
      }

      const event = JSON.parse(trimmedLine) as RemoteCommandStreamEvent;

      if (event.type === "start") {
        appendRemoteStreamLine({ stream: "system", text: event.message, elapsedMs: event.elapsedMs });
        return;
      }

      if (event.type === "stdout") {
        appendRemoteStreamLine({ stream: "stdout", text: event.chunk, elapsedMs: event.elapsedMs });
        return;
      }

      if (event.type === "stderr") {
        appendRemoteStreamLine({ stream: "stderr", text: event.chunk, elapsedMs: event.elapsedMs });
        return;
      }

      if (event.type === "result") {
        streamState.result = event.result;
        appendRemoteStreamLine({
          stream: event.result.exitCode === 0 ? "system" : "stderr",
          text: `Command finished with exit ${event.result.exitCode}.`,
          elapsedMs: event.result.elapsedMs
        });
        return;
      }

      streamState.error = event.error;
      appendRemoteStreamLine({ stream: "stderr", text: `Command stream failed: ${event.error}`, elapsedMs: event.elapsedMs });
    };

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }

    buffer += decoder.decode();
    handleLine(buffer);

    if (streamState.error) {
      throw new Error(streamState.error);
    }

    const result = streamState.result;

    if (!result) {
      throw new Error("Remote command stream ended before returning a result.");
    }

    return result;
  }

  function appendRemoteStreamLine(line: Omit<RemoteStreamLine, "id">) {
    setRemoteStreamLines((current) => [...current.slice(-199), { ...line, id: createClientId("remote-stream") }]);
  }

  function appendCodingChatMessage(taskId: string, message: CodingChatMessage) {
    setCodingChatMessages((current) => ({ ...current, [taskId]: [...(current[taskId] ?? []), message] }));
  }

  function clearPendingCodingCommand(taskId: string, messageId: string) {
    setCodingChatMessages((current) => ({
      ...current,
      [taskId]: (current[taskId] ?? []).map((message) =>
        message.id === messageId ? { ...message, command: message.pendingCommand, pendingCommand: undefined } : message
      )
    }));
  }

  function dismissPendingCodingCommand(taskId: string, messageId: string) {
    setCodingChatMessages((current) => ({
      ...current,
      [taskId]: (current[taskId] ?? []).map((message) =>
        message.id === messageId ? { ...message, content: `${message.content}\n已取消执行。`, pendingCommand: undefined } : message
      )
    }));
  }

  async function requestRemoteServer(extra: { action: "connect" | "refresh" | "run"; cwd?: string; command?: string; timeoutMs?: number }) {
    const response = await fetch("/api/remote-server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...remoteForm,
        port: remoteForm.port ? Number(remoteForm.port) : undefined,
        cwd: extra.cwd ?? selectedCodingSpace?.path ?? remoteForm.basePath,
        command: extra.command,
        timeoutMs: extra.timeoutMs,
        action: extra.action
      })
    });

    const payload = (await response.json()) as RemoteServerResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Remote server request failed.");
    }

    return payload;
  }

  async function handlePlannerChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace || !selectedTask) {
      return;
    }

    const message = plannerChatInput.trim();

    if (!message || isPlannerChatting) {
      return;
    }

    setIsPlannerChatting(true);
    setPlannerChatError(null);

    try {
      const response = await fetch("/api/planner-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: selectedTask.goal, planner: selectedWorkspace.planner, message })
      });
      const payload = (await response.json()) as PlannerChatResponse;

      if (!response.ok || !payload.planner) {
        throw new Error(payload.error ?? "Planner chat failed.");
      }

      const updatedWorkspace: WorkspaceTask = {
        ...selectedWorkspace,
        planner: payload.planner!,
        task: { ...selectedWorkspace.task, updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }) }
      };

      setWorkspaces((current) => current.map((workspace) => (workspace.task.id === selectedWorkspace.task.id ? updatedWorkspace : workspace)));
      setPlannerChatInput("");
      void persistWorkspace(updatedWorkspace);
    } catch (caughtError) {
      setPlannerChatError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsPlannerChatting(false);
    }
  }

  async function handleIdeaChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace || !selectedTask) {
      return;
    }

    const message = ideaChatInput.trim();

    if (!message || isIdeaChatting) {
      return;
    }

    setIsIdeaChatting(true);
    setIdeaChatError(null);

    try {
      const selectedIdea = selectedWorkspace.ideas.find((idea) => idea.status === "selected") ?? null;
      const response = await fetch("/api/idea-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: selectedTask.goal,
          domain: selectedTask.domain,
          planner: selectedWorkspace.planner,
          ideas: selectedWorkspace.ideas,
          ideaChatMessages: selectedWorkspace.ideaChatMessages ?? [],
          selectedIdeaId: selectedIdea?.id ?? "",
          message
        })
      });
      const payload = (await response.json()) as IdeaChatResponse;

      if (!response.ok || !payload.ideas || !payload.ideaChatMessages) {
        throw new Error(payload.error ?? "Idea chat failed.");
      }

      const updatedWorkspace = applyIdeaChatUpdateToWorkspace(selectedWorkspace, payload.ideas, payload.ideaChatMessages);

      setWorkspaces((current) => current.map((workspace) => (workspace.task.id === selectedWorkspace.task.id ? updatedWorkspace : workspace)));
      setIdeaChatInput("");
      setSelectedNodeId("idea");
      void persistWorkspace(updatedWorkspace);
    } catch (caughtError) {
      setIdeaChatError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsIdeaChatting(false);
    }
  }

  async function executeResearchTask(goalText: string, replaceTaskId?: string) {
    const trimmedGoal = goalText.trim();

    if (!trimmedGoal || isExecuting) {
      return;
    }

    setIsExecuting(true);
    setError(null);
    setBackendLogs([]);

    try {
      const response = await fetch("/api/research-tasks?stream=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson"
        },
        body: JSON.stringify({ goal: trimmedGoal })
      });

      const payload = await readResearchTaskResponse(response);

      setBackendLogs(payload.workspace.backendLogs);

      setWorkspaces((current) => {
        if (!replaceTaskId) {
          return [payload.workspace, ...current];
        }

        return current.map((workspace) => (workspace.task.id === replaceTaskId ? payload.workspace : workspace));
      });
      setSelectedTaskId(payload.workspace.task.id);
      setSelectedNodeId(payload.workspace.task.activeNodeId || payload.workspace.nodes[0]?.id || null);
      setGoal("");
      void persistWorkspace(payload.workspace);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsExecuting(false);
    }
  }

  async function readResearchTaskResponse(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.body || !contentType.includes("application/x-ndjson")) {
      const payload = await readResearchTaskJsonPayload(response);

      if (payload.backendLogs) {
        setBackendLogs(payload.backendLogs);
      }

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error ?? "LLM execution failed.");
      }

      return { workspace: payload.workspace };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let workspace: WorkspaceTask | null = null;
    let streamError: string | null = null;

    const handleLine = (line: string) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return;
      }

      const event = JSON.parse(trimmedLine) as ResearchTaskStreamEvent;

      if (event.type === "log") {
        setBackendLogs((current) => [...current, event.entry]);
        return;
      }

      if (event.type === "workspace") {
        workspace = event.workspace;
        setBackendLogs(event.backendLogs ?? event.workspace.backendLogs);
        return;
      }

      streamError = event.error;
      setBackendLogs(event.backendLogs ?? []);
    };

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }

    buffer += decoder.decode();
    handleLine(buffer);

    if (streamError) {
      throw new Error(streamError);
    }

    if (!workspace) {
      throw new Error("Backend stream ended before returning a workspace.");
    }

    return { workspace };
  }

  async function readResearchTaskJsonPayload(response: Response): Promise<ResearchTaskJsonPayload> {
    const text = await response.text();

    if (!text.trim()) {
      return { error: `Request failed with HTTP ${response.status}.` };
    }

    try {
      return JSON.parse(text) as ResearchTaskJsonPayload;
    } catch {
      const message = summarizeNonJsonResponse(text);
      return {
        error: response.ok ? `Unexpected non-JSON response: ${message}` : `Request failed with HTTP ${response.status}: ${message}`
      };
    }
  }

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <BrainCircuit size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Agentic Research</p>
            <h1>Workspace</h1>
          </div>
        </div>

        <form className="task-form" onSubmit={handleCreateTask}>
          <label htmlFor="goal">Research goal</label>
          <textarea
            id="goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="输入一个研究目标，例如：围绕 3D reconstruction 跑一个最小验证实验"
            disabled={isExecuting}
          />
          <button type="submit" className="primary-button" disabled={isExecuting || !goal.trim()}>
            {isExecuting ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {isExecuting ? "Running LLM" : "Create task"}
          </button>
        </form>

        <WorkspaceArchivePanel status={archiveStatus} />

        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <nav className="task-list" aria-label="Research tasks">
          {workspaces.length === 0 ? (
            <div className="task-empty">提交研究目标后，这里会显示真实 LLM 生成的任务。</div>
          ) : (
            workspaces.map((workspace) => (
              <button
                key={workspace.task.id}
                type="button"
                className={`task-item ${workspace.task.id === selectedTask?.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedTaskId(workspace.task.id);
                  setSelectedNodeId(workspace.task.activeNodeId || workspace.nodes[0]?.id || null);
                }}
              >
                <span className={`status-dot ${workspace.task.status}`} />
                <span>
                  <strong>{workspace.task.goal}</strong>
                  <small>{workspace.task.domain}</small>
                </span>
              </button>
            ))
          )}
        </nav>
      </aside>

      <section className="main-panel">
        {!selectedWorkspace || !selectedTask ? (
          isExecuting || visibleBackendLogs.length > 0 ? (
            <div className="empty-workspace-wrap with-logs">
              <EmptyWorkspace isExecuting={isExecuting} />
              <BackendStatusPanel logs={visibleBackendLogs} isExecuting={isExecuting} />
            </div>
          ) : (
            <EmptyWorkspace isExecuting={isExecuting} />
          )
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Current research task</p>
                <h2>{selectedTask.goal}</h2>
                <p className="muted">{selectedTask.domain} · Updated {selectedTask.updatedAt}</p>
              </div>
              <div className="topbar-actions" aria-label="Task actions">
                <button type="button" className="icon-button" title="Pause task" disabled>
                  <CirclePause size={18} aria-hidden="true" />
                </button>
                <button type="button" className="icon-button" title="Re-run LLM task" onClick={handleRerunTask} disabled={isExecuting}>
                  <RotateCcw size={18} aria-hidden="true" />
                </button>
                <button type="button" className="primary-button compact" onClick={handleRerunTask} disabled={isExecuting}>
                  {isExecuting ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  Run LLM
                </button>
              </div>
            </header>

            <section className="metric-strip" aria-label="Task metrics">
              <MetricCard icon={<LayoutDashboard size={18} />} label="Task status" value={statusLabels[selectedTask.status]} />
              <MetricCard icon={<GitBranch size={18} />} label="Graph progress" value={`${selectedTask.progress}%`} />
              <MetricCard icon={<FlaskConical size={18} />} label="Experiment" value={statusLabels[selectedWorkspace.experiment.status]} />
              <MetricCard icon={<FileText size={18} />} label="Paper draft" value={statusLabels[selectedWorkspace.paperDraft.status]} />
            </section>

            <BackendStatusPanel logs={visibleBackendLogs} isExecuting={isExecuting} />

            <div className="content-grid tabbed-workspace">
              <section className="panel graph-panel overview-panel">
                <PanelTitle icon={<GitBranch size={18} />} title="Task Graph" action="LLM generated" />
                {sortedNodes.length === 0 ? (
                  <InlineEmpty message="LLM 没有返回任务图节点。" />
                ) : (
                  <div className="graph-flow" aria-label="Task graph nodes">
                    {sortedNodes.map((node, index) => (
                      <GraphNode
                        key={node.id}
                        node={node}
                        isSelected={node.id === selectedNode?.id}
                        isLast={index === sortedNodes.length - 1}
                        onSelect={() => setSelectedNodeId(node.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <WorkspaceTabs nodes={sortedNodes} selectedNodeId={selectedNode?.id ?? null} onSelect={setSelectedNodeId} />

              <section className="panel node-panel">
                <PanelTitle icon={<Activity size={18} />} title="Node Detail" action={selectedNode ? statusLabels[selectedNode.status] : "Empty"} />
                {selectedNode ? (
                  <>
                    <NodeDetail node={selectedNode} />
                    <NodeAction
                      node={selectedNode}
                      selectedIdea={selectedWorkspace.ideas.find((idea) => idea.status === "selected") ?? null}
                    />
                  </>
                ) : (
                  <InlineEmpty message="请选择一个任务节点。" />
                )}
              </section>

              {selectedNode?.id === "planner" && (
                <PlannerWorkspacePanel
                  planner={selectedWorkspace.planner}
                  chatInput={plannerChatInput}
                  chatError={plannerChatError}
                  isChatting={isPlannerChatting}
                  onChatInputChange={setPlannerChatInput}
                  onChatSubmit={handlePlannerChatSubmit}
                />
              )}

              {selectedNode?.id === "idea" && (
                <IdeaWorkspacePanel
                  ideas={selectedWorkspace.ideas}
                  messages={selectedWorkspace.ideaChatMessages ?? []}
                  chatInput={ideaChatInput}
                  chatError={ideaChatError}
                  isChatting={isIdeaChatting}
                  onSelectIdea={handleSelectIdea}
                  onChatInputChange={setIdeaChatInput}
                  onChatSubmit={handleIdeaChatSubmit}
                />
              )}

              {selectedNode?.id === "coding" && (
                <>
                  <CodingWorkspacePanel
                    node={selectedNode}
                    selectedIdea={selectedWorkspace.ideas.find((idea) => idea.status === "selected") ?? null}
                    machine={remoteMachine}
                    selectedSpace={selectedCodingSpace}
                    repositories={surveyGithubRepositories}
                    selectedBaseRepoValue={effectiveBaseRepoValue}
                    selectedBaseRepo={selectedBaseRepo}
                    onSelectBaseRepo={handleBaseRepoChange}
                    onGenerateCodingPlan={handleAdvanceCoding}
                  />
                  <RemoteCodingPanel
                    form={remoteForm}
                    status={remoteStatus}
                    error={remoteError}
                    machine={remoteMachine}
                    spaces={codingSpaces}
                    selectedSpace={selectedCodingSpace}
                    commandResult={remoteCommandResult}
                    streamLines={remoteStreamLines}
                    isLive={isRemoteLive}
                    isAutoRepairEnabled={isAutoRepairEnabled}
                    selectedBaseRepo={selectedBaseRepo}
                    chatMessages={visibleCodingChatMessages}
                    chatInput={codingChatInput}
                    isChatRunning={isCodingChatRunning}
                    onFormChange={updateRemoteForm}
                    onConnect={handleRemoteConnect}
                    onRefresh={() => void refreshRemoteServer()}
                    onSelectSpace={(spacePath) => setSelectedCodingSpace(codingSpaces.find((space) => space.path === spacePath) ?? null)}
                    onToggleLive={setIsRemoteLive}
                    onToggleAutoRepair={setIsAutoRepairEnabled}
                    onChatInputChange={setCodingChatInput}
                    onChatSubmit={handleCodingChatSubmit}
                    onExecutePendingCommand={(messageId, command) => {
                      if (selectedTaskId) {
                        void executeRemoteCodingCommand(selectedTaskId, command, messageId);
                      }
                    }}
                    onDismissPendingCommand={(messageId) => {
                      if (selectedTaskId) {
                        dismissPendingCodingCommand(selectedTaskId, messageId);
                      }
                    }}
                  />
                </>
              )}

              {selectedNode?.id === "experiment" && <section className="panel experiment-panel">
                <PanelTitle icon={<Beaker size={18} />} title="Experiment Workspace" action={selectedWorkspace.experiment.id} />
                <div className="experiment-layout">
                  <div>
                    <h3>{selectedWorkspace.experiment.name}</h3>
                    <p className="muted">Code version {selectedWorkspace.experiment.codeVersion}</p>
                    <div className="config-grid">
                      {Object.entries(selectedWorkspace.experiment.config).length === 0 ? (
                        <InlineEmpty message="LLM 没有返回实验配置。" />
                      ) : (
                        Object.entries(selectedWorkspace.experiment.config).map(([key, value]) => (
                          <div key={key}>
                            <span>{key}</span>
                            <strong>{String(value)}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="metric-list">
                    {selectedWorkspace.experiment.metrics.length === 0 ? (
                      <InlineEmpty message="尚无真实实验指标；需要接入 Runner 后产生。" />
                    ) : (
                      selectedWorkspace.experiment.metrics.map((metric) => (
                        <div key={metric.label} className="metric-row">
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                          <small>{metric.trend}</small>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {selectedWorkspace.experiment.logs.length > 0 && <pre className="log-box">{selectedWorkspace.experiment.logs.join("\n")}</pre>}
              </section>}

              {selectedNode?.id === "evaluation" && <section className="panel evaluation-panel">
                <PanelTitle icon={<MessageSquareText size={18} />} title="Evaluation & Iteration" action={selectedWorkspace.evaluation.improvement} />
                <div className="recommendation-box">
                  <h3>Evaluation plan</h3>
                  <p>{selectedWorkspace.evaluation.summary}</p>
                  <ResultList title="Next actions" items={selectedWorkspace.evaluation.nextActions} />
                  <ResultList title="Risks" items={selectedWorkspace.evaluation.risks} />
                  <button type="button" className="secondary-button" onClick={handleRerunTask} disabled={isExecuting}>
                    <RotateCcw size={16} aria-hidden="true" />
                    Re-run with LLM
                  </button>
                </div>
              </section>}

              {(selectedNode?.id === "evaluation" || selectedNode?.id === "paper") && <section className="panel memory-panel">
                <PanelTitle icon={<Search size={18} />} title="Memory Explorer" action="Generated items" />
                <div className="memory-list">
                  {selectedWorkspace.memoryItems.length === 0 ? (
                    <InlineEmpty message="LLM 没有返回可沉淀 memory。" />
                  ) : (
                    selectedWorkspace.memoryItems.map((item) => (
                      <article key={item.id}>
                        <span>{item.type}</span>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>}

              {selectedNode?.id === "paper" && <section className="panel paper-panel">
                <PanelTitle icon={<BookOpenText size={18} />} title="Paper Editor" action="LaTeX draft" />
                <div className="paper-sections">
                  {selectedWorkspace.paperDraft.sections.map((section) => (
                    <div key={section.title}>
                      <span>{section.state.replace("_", " ")}</span>
                      <strong>{section.title}</strong>
                    </div>
                  ))}
                </div>
                <pre className="latex-box">{selectedWorkspace.paperDraft.latexPreview}</pre>
              </section>}

            </div>
          </>
        )}
      </section>
    </main>
  );
}

function EmptyWorkspace({ isExecuting }: { isExecuting: boolean }) {
  const highlights = [
    {
      icon: <FlaskConical size={18} aria-hidden="true" />,
      label: "优势 1",
      title: "自动实验矩阵",
      description: "围绕对比、消融和最小验证自动拆解实验任务。"
    },
    {
      icon: <Activity size={18} aria-hidden="true" />,
      label: "优势 2",
      title: "数据驱动迭代",
      description: "基于实验数据持续更新路径，保留可追踪的证据链。"
    },
    {
      icon: <BookOpenText size={18} aria-hidden="true" />,
      label: "优势 3",
      title: "论文同步沉淀",
      description: "同步整理方法、实验和评估建议，生成可编辑 LaTeX 初稿。"
    }
  ];

  return (
    <section className="empty-state">
      <div className="empty-icon">
        {isExecuting ? <LoaderCircle className="spin" size={34} aria-hidden="true" /> : <BrainCircuit size={34} aria-hidden="true" />}
      </div>
      <p className="eyebrow">Real LLM execution</p>
      <h2>{isExecuting ? "正在调用本地 LLM 生成研究工作台" : "输入研究目标，启动真实 Agentic Research 规划"}</h2>
      <p className="empty-lead">Agentic 将研究目标转化为 Task Graph、Deep Idea、实验计划、评估建议与 LaTeX 初稿，让研究者专注于提出问题与验证方向。</p>
      <div className="empty-highlight-grid" aria-label="Agentic research advantages">
        {highlights.map((highlight) => (
          <article className="empty-highlight" key={highlight.title}>
            <span className="empty-highlight-icon">{highlight.icon}</span>
            <div>
              <small>{highlight.label}</small>
              <strong>{highlight.title}</strong>
              <p>{highlight.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkspaceArchivePanel({ status }: { status: WorkspaceArchiveStatus }) {
  const icon = status.state === "loading" || status.state === "saving" ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />;

  return (
    <div className={`archive-status ${status.state}`} aria-live="polite">
      <span>{icon}</span>
      <div>
        <strong>Workspace archive</strong>
        <p>{status.message}</p>
        {status.markdownPath && <small>{status.markdownPath}</small>}
      </div>
    </div>
  );
}

function BackendStatusPanel({ logs, isExecuting }: { logs: BackendExecutionLog[]; isExecuting: boolean }) {
  return (
    <section className="panel backend-log-panel" aria-label="Backend execution status">
      <PanelTitle icon={<TerminalSquare size={18} />} title="Backend Execution" action={isExecuting ? "Streaming" : `${logs.length} events`} />
      {logs.length === 0 ? (
        <InlineEmpty message="等待后端返回执行状态。" />
      ) : (
        <div className="backend-log-list">
          {logs.map((log) => (
            <article key={log.id} className={`backend-log-item ${log.status}`}>
              <span className="backend-log-marker" aria-hidden="true" />
              <div>
                <div className="backend-log-heading">
                  <strong>{log.phase}</strong>
                  <span>{formatElapsed(log.elapsedMs)}</span>
                </div>
                <p>{log.message}</p>
                <small>{log.timestamp}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function IdeaWorkspacePanel({
  ideas,
  messages,
  chatInput,
  chatError,
  isChatting,
  onSelectIdea,
  onChatInputChange,
  onChatSubmit
}: {
  ideas: Idea[];
  messages: IdeaChatMessage[];
  chatInput: string;
  chatError: string | null;
  isChatting: boolean;
  onSelectIdea: (ideaId: string) => void;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedIdea = ideas.find((idea) => idea.status === "selected") ?? null;

  return (
    <section className="panel idea-panel">
      <PanelTitle icon={<Sparkles size={18} />} title="Idea Workspace" action={`${ideas.length} ideas`} />
      <div className="idea-workspace-layout">
        <div className="idea-list">
          {ideas.length === 0 ? (
            <InlineEmpty message="LLM 没有返回候选 idea。" />
          ) : (
            ideas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                className={`idea-card ${idea.status}`}
                aria-pressed={idea.status === "selected"}
                onClick={() => onSelectIdea(idea.id)}
              >
                <div className="card-heading">
                  <strong className="idea-title">{idea.title}</strong>
                  <span>{idea.status}</span>
                </div>
                <p>{idea.hypothesis}</p>
                <small>{idea.methodSketch}</small>
                {idea.expectedEvidence.length > 0 && (
                  <ul>
                    {idea.expectedEvidence.map((evidence) => (
                      <li key={evidence}>{evidence}</li>
                    ))}
                  </ul>
                )}
              </button>
            ))
          )}
        </div>

        <section className="idea-chat-section">
          <div className="idea-chat-heading">
            <div>
              <strong>Idea chat</strong>
              <small>{selectedIdea ? `Selected: ${selectedIdea.title}` : "No idea selected"}</small>
            </div>
            <span>{messages.length} messages</span>
          </div>

          <div className="idea-chat-actions" aria-label="Idea quick edits">
            <button type="button" className="ghost-button" onClick={() => onChatInputChange("把候选 idea 收敛成 3 个，并保留最可落地的一个为 selected")} disabled={isChatting}>
              收敛 3 个
            </button>
            <button type="button" className="ghost-button" onClick={() => onChatInputChange("强化当前 selected idea 的 hypothesis、methodSketch 和 expectedEvidence，使它能直接进入最小实验")} disabled={isChatting || !selectedIdea}>
              强化选中
            </button>
            <button type="button" className="ghost-button" onClick={() => onChatInputChange("新增一个偏 baseline 对照和消融验证的 idea")} disabled={isChatting}>
              新增对照
            </button>
          </div>

          <div className="idea-chat-log" aria-label="Idea chat log">
            {messages.length === 0 ? (
              <InlineEmpty message="可以用自然语言编辑候选 idea，例如新增、合并、重写、选择或补充验证证据。" />
            ) : (
              messages.map((message) => (
                <article key={message.id} className={`idea-chat-message ${message.role}`}>
                  <strong>{message.role === "user" ? "You" : "Idea Agent"}</strong>
                  <p>{message.content}</p>
                  <small>{message.createdAt}</small>
                </article>
              ))
            )}
          </div>

          {chatError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{chatError}</span>
            </div>
          )}

          <form className="idea-chat-form" onSubmit={onChatSubmit}>
            <textarea
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              placeholder="例如：合并前两个 idea，保留更容易跑通的版本，并补充第一步验证指标"
              disabled={isChatting}
            />
            <button type="submit" className="secondary-button" disabled={isChatting || !chatInput.trim()}>
              {isChatting ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Update ideas
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

function PlannerWorkspacePanel({
  planner,
  chatInput,
  chatError,
  isChatting,
  onChatInputChange,
  onChatSubmit
}: {
  planner: WorkspaceTask["planner"];
  chatInput: string;
  chatError: string | null;
  isChatting: boolean;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const plannerPapers = normalizePlannerPapersForDisplay(planner.papers);
  const paperRelations = Array.isArray(planner.paperRelations) ? planner.paperRelations : [];
  const comparisonRows = Array.isArray(planner.comparisonRows) ? planner.comparisonRows : [];
  const groupedPapers = groupPlannerPapers(plannerPapers);
  const timelinePapers = sortPlannerPapersByDate(plannerPapers).slice(0, 20);

  return (
    <section className="panel planner-panel">
      <PanelTitle icon={<Search size={18} />} title="Planner Research" action={`${plannerPapers.length} papers`} />

      <div className="planner-sections">
        <section className="planner-section">
          <div className="planner-section-heading">
            <h3>Paper collection</h3>
            <span>latest 5 · top cited 5 · git 5 · up to 20</span>
          </div>
          <div className="planner-paper-groups">
            <PlannerPaperGroup title="Latest" description="最新 5 篇" papers={groupedPapers.latest} />
            <PlannerPaperGroup title="Top cited" description="引用最多 5 篇" papers={groupedPapers.topCited} />
            <PlannerPaperGroup title="Open Git" description="有开源 Git 的 5 篇" papers={groupedPapers.openSource} />
            <PlannerPaperGroup title="Supplemental" description="补充到 20 篇" papers={groupedPapers.supplemental} />
          </div>
        </section>

        <section className="planner-section">
          <div className="planner-section-heading">
            <h3>Paper map</h3>
            <span>timeline · relations · comparable</span>
          </div>
          <div className="planner-visual-grid">
            <div className="planner-timeline" aria-label="Paper timeline">
              {timelinePapers.map((paper) => (
                <article key={paper.id} className="planner-timeline-item">
                  <span>{paper.publishedAt}</span>
                  <strong>{paper.title}</strong>
                  <small>{formatCitationCount(paper.citationCount)} citations · {formatPaperCategories(paper.categories)}</small>
                </article>
              ))}
            </div>
            <div className="planner-relation-list" aria-label="Paper relations">
              {paperRelations.length === 0 ? (
                <InlineEmpty message="暂无可视化关系；可以在 Planner chat 里要求补充引用链和方法继承关系。" />
              ) : (
                paperRelations.map((relation, index) => (
                  <article key={`${relation.sourceId}-${relation.targetId}-${index}`} className="planner-relation-item">
                    <strong>{getPlannerPaperLabel(plannerPapers, relation.sourceId)}</strong>
                    <span>{relation.relation}</span>
                    <strong>{getPlannerPaperLabel(plannerPapers, relation.targetId)}</strong>
                    <p>{relation.evidence}</p>
                  </article>
                ))
              )}
            </div>
          </div>
          <div className="planner-comparison-table" role="table" aria-label="Planner paper comparison">
            <div role="row" className="planner-comparison-row header">
              <span>Axis</span>
              <span>Latest</span>
              <span>Top cited</span>
              <span>Open Git</span>
              <span>Takeaway</span>
            </div>
            {comparisonRows.map((row) => (
              <div role="row" className="planner-comparison-row" key={row.axis}>
                <strong>{row.axis}</strong>
                <span>{row.latest}</span>
                <span>{row.topCited}</span>
                <span>{row.openSource}</span>
                <span>{row.takeaway}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="planner-section">
          <div className="planner-section-heading">
            <h3>Integrated report</h3>
            <span>Status quo</span>
          </div>
          <p className="planner-report-text">{planner.report}</p>
        </section>

        <section className="planner-section">
          <div className="planner-section-heading">
            <h3>Feasible ideas</h3>
            <span>{planner.ideas.length} candidates</span>
          </div>
          <div className="planner-idea-list">
            {planner.ideas.map((idea) => (
              <article key={idea.id} className="planner-idea-item">
                <strong>{idea.title}</strong>
                <p>{idea.rationale}</p>
                <small>{idea.firstExperiment}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="planner-section planner-chat-section">
          <div className="planner-section-heading">
            <h3>Planner chat</h3>
            <span>{planner.chatMessages.length} messages</span>
          </div>
          <div className="planner-chat-log">
            {planner.chatMessages.map((message) => (
              <article key={message.id} className={`planner-chat-message ${message.role}`}>
                <strong>{message.role === "user" ? "You" : "Planner Agent"}</strong>
                <p>{message.content}</p>
                <small>{message.createdAt}</small>
              </article>
            ))}
          </div>
          {chatError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{chatError}</span>
            </div>
          )}
          <form className="planner-chat-form" onSubmit={onChatSubmit}>
            <textarea
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              placeholder="补充 CVPR/NeurIPS 近两年论文，重新收敛成两个可跑实验"
              disabled={isChatting}
            />
            <button type="submit" className="secondary-button" disabled={isChatting || !chatInput.trim()}>
              {isChatting ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Refine planner
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

function PlannerPaperGroup({
  title,
  description,
  papers
}: {
  title: string;
  description: string;
  papers: WorkspaceTask["planner"]["papers"];
}) {
  return (
    <section className="planner-paper-group">
      <div className="planner-paper-group-heading">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="planner-paper-list">
        {papers.length === 0 ? (
          <InlineEmpty message="暂无论文；可以通过 Planner chat 要求补充这一组。" />
        ) : (
          papers.slice(0, 5).map((paper) => (
            <article key={`${title}-${paper.id}`} className="planner-paper-item">
              <div className="planner-paper-title">
                <strong>{paper.title}</strong>
                <span>{paper.publishedAt}</span>
              </div>
              <p>{paper.summary}</p>
              <div className="planner-paper-meta">
                <span>Citations: {paper.citations}</span>
                <span>{formatPaperCategories(paper.categories)}</span>
                {renderPlannerLink("Paper", paper.url)}
                {renderPlannerLink("Git", paper.codeUrl)}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function renderPlannerLink(label: string, value: string) {
  if (!isUsableUrl(value)) {
    return <span>{label}: {value}</span>;
  }

  return (
    <a href={value} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function groupPlannerPapers(papers: WorkspaceTask["planner"]["papers"]) {
  const byCategory = {
    latest: papers.filter((paper) => paper.categories.includes("latest")),
    topCited: papers.filter((paper) => paper.categories.includes("top_cited")),
    openSource: papers.filter((paper) => paper.categories.includes("open_source")),
    supplemental: papers.filter((paper) => paper.categories.includes("supplemental"))
  };

  return {
    latest: byCategory.latest.slice(0, 5),
    topCited: [...byCategory.topCited].sort((first, second) => second.citationCount - first.citationCount).slice(0, 5),
    openSource: byCategory.openSource.slice(0, 5),
    supplemental: byCategory.supplemental.slice(0, 5)
  };
}

function formatPaperCategories(categories: string[]) {
  return categories.length > 0 ? categories.map((category) => category.replace("_", " ")).join(" · ") : "supplemental";
}

function formatCitationCount(value: number) {
  return value > 0 ? String(value) : "待核验";
}

function normalizePlannerPapersForDisplay(papers: WorkspaceTask["planner"]["papers"]): WorkspaceTask["planner"]["papers"] {
  return papers.map((paper, index) => ({
    ...paper,
    citationCount: normalizePlannerCitationCount(paper),
    categories: normalizePlannerDisplayCategories(paper, index)
  }));
}

function normalizePlannerDisplayCategories(paper: PlannerPaperForDisplay, index: number): PlannerPaperDisplayCategory[] {
  const rawCategories = (paper as { categories?: unknown }).categories;

  if (Array.isArray(rawCategories)) {
    const categories = rawCategories.filter(
      (category): category is PlannerPaperDisplayCategory =>
        category === "latest" || category === "top_cited" || category === "open_source" || category === "supplemental"
    );

    if (categories.length > 0) {
      return categories;
    }
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

function normalizePlannerCitationCount(paper: PlannerPaperForDisplay) {
  const rawCitationCount = (paper as { citationCount?: unknown }).citationCount;

  if (typeof rawCitationCount === "number" && Number.isFinite(rawCitationCount)) {
    return rawCitationCount;
  }

  const match = paper.citations.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function sortPlannerPapersByDate(papers: WorkspaceTask["planner"]["papers"]) {
  return [...papers].sort((first, second) => getPlannerPaperYear(second.publishedAt) - getPlannerPaperYear(first.publishedAt));
}

function getPlannerPaperYear(value: string) {
  const match = value.match(/20\d{2}|19\d{2}/);
  return match ? Number(match[0]) : 0;
}

function getPlannerPaperLabel(papers: WorkspaceTask["planner"]["papers"], id: string) {
  const paper = papers.find((item) => item.id === id);
  return paper ? paper.title : id;
}

function CodingWorkspacePanel({
  node,
  selectedIdea,
  machine,
  selectedSpace,
  repositories,
  selectedBaseRepoValue,
  selectedBaseRepo,
  onSelectBaseRepo,
  onGenerateCodingPlan
}: {
  node: TaskNode;
  selectedIdea: Idea | null;
  machine: RemoteMachineSnapshot | null;
  selectedSpace: CodingSpace | null;
  repositories: SurveyGithubRepository[];
  selectedBaseRepoValue: string;
  selectedBaseRepo: SurveyGithubRepository | null;
  onSelectBaseRepo: (value: string) => void;
  onGenerateCodingPlan: () => void;
}) {
  const hasMachine = Boolean(machine && selectedSpace);
  const canGeneratePlan = Boolean(selectedIdea && hasMachine);

  return (
    <section className="panel coding-workspace-panel">
      <PanelTitle icon={<TerminalSquare size={18} />} title="Coding Workspace" action={hasMachine ? "Machine ready" : "Setup required"} />

      <div className="coding-setup-grid">
        <article className={`coding-setup-card ${hasMachine ? "ready" : "pending"}`}>
          <div className="coding-setup-heading">
            <span className="setup-step">1</span>
            <div>
              <strong>Development machine</strong>
              <small>SSH server · coding space</small>
            </div>
          </div>
          {machine && selectedSpace ? (
            <div className="coding-setup-summary">
              <span>{machine.hostname}</span>
              <strong>{selectedSpace.path}</strong>
              <small>{machine.cpu.cores} CPU cores · {formatMb(machine.memory.totalMb)} memory</small>
            </div>
          ) : (
            <InlineEmpty message="先在下方 Remote Coding Space 连接服务器，并选择 coding space。" />
          )}
        </article>

        <article className="coding-setup-card ready">
          <div className="coding-setup-heading">
            <span className="setup-step">2</span>
            <div>
              <strong>Survey base repo</strong>
              <small>GitHub repository · optional</small>
            </div>
          </div>
          <label className="base-repo-select">
            <span>Base repository</span>
            <select value={selectedBaseRepoValue} onChange={(event) => onSelectBaseRepo(event.target.value)}>
              <option value={NO_BASE_REPO_VALUE}>No base repo</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.url}>
                  {repo.name}
                </option>
              ))}
            </select>
          </label>
          {selectedBaseRepo ? (
            <div className="selected-base-repo">
              <a href={selectedBaseRepo.url} target="_blank" rel="noreferrer">
                {selectedBaseRepo.url}
              </a>
              <small>From {selectedBaseRepo.sourcePaperTitle}</small>
            </div>
          ) : repositories.length === 0 ? (
            <InlineEmpty message="Planner 还没有收集到可用的 GitHub 仓库；本次可以不选择 base repo。" />
          ) : (
            <InlineEmpty message="当前选择不使用 survey GitHub repo 作为 base。" />
          )}
        </article>
      </div>

      <div className="coding-plan-box">
        {selectedIdea ? (
          <div>
            <span>Selected idea</span>
            <strong>{selectedIdea.title}</strong>
            <p>{selectedIdea.methodSketch}</p>
          </div>
        ) : (
          <InlineEmpty message="请先回到 Idea Workspace 选择一个 idea。" />
        )}
        {node.status === "done" ? <pre>{node.output}</pre> : null}
        <button type="button" className="secondary-button" onClick={onGenerateCodingPlan} disabled={!canGeneratePlan}>
          <Play size={16} aria-hidden="true" />
          {node.status === "done" ? "Regenerate coding plan" : "Generate coding plan"}
        </button>
      </div>
    </section>
  );
}

function RemoteCodingPanel({
  form,
  status,
  error,
  machine,
  spaces,
  selectedSpace,
  commandResult,
  streamLines,
  isLive,
  isAutoRepairEnabled,
  selectedBaseRepo,
  chatMessages,
  chatInput,
  isChatRunning,
  onFormChange,
  onConnect,
  onRefresh,
  onSelectSpace,
  onToggleLive,
  onToggleAutoRepair,
  onChatInputChange,
  onChatSubmit,
  onExecutePendingCommand,
  onDismissPendingCommand
}: {
  form: RemoteForm;
  status: RemoteStatus;
  error: string | null;
  machine: RemoteMachineSnapshot | null;
  spaces: CodingSpace[];
  selectedSpace: CodingSpace | null;
  commandResult: RemoteCommandResult | null;
  streamLines: RemoteStreamLine[];
  isLive: boolean;
  isAutoRepairEnabled: boolean;
  selectedBaseRepo: SurveyGithubRepository | null;
  chatMessages: CodingChatMessage[];
  chatInput: string;
  isChatRunning: boolean;
  onFormChange: (field: keyof RemoteForm, value: string) => void;
  onConnect: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
  onSelectSpace: (spacePath: string) => void;
  onToggleLive: (isLive: boolean) => void;
  onToggleAutoRepair: (isEnabled: boolean) => void;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onExecutePendingCommand: (messageId: string, command: string) => void;
  onDismissPendingCommand: (messageId: string) => void;
}) {
  const isBusy = status === "connecting" || status === "refreshing" || status === "running";
  const isConnected = Boolean(machine);
  const hasSelectedSpace = Boolean(machine && selectedSpace);
  const taskProgress = getRemoteTaskProgress(status, streamLines, commandResult);

  return (
    <section className="panel remote-panel" aria-label="Remote coding space">
      <PanelTitle icon={<Server size={18} />} title="Remote Coding Space" action={isConnected ? "Connected" : "SSH"} />

      <form className="remote-form" onSubmit={onConnect}>
        <label>
          <span>SSH address</span>
          <input
            value={form.address}
            onChange={(event) => onFormChange("address", event.target.value)}
            placeholder="user@server.example.com:22"
            disabled={isBusy}
          />
        </label>
        <label>
          <span>User</span>
          <input value={form.username} onChange={(event) => onFormChange("username", event.target.value)} placeholder="optional" disabled={isBusy} />
        </label>
        <label>
          <span>Port</span>
          <input value={form.port} onChange={(event) => onFormChange("port", event.target.value)} inputMode="numeric" disabled={isBusy} />
        </label>
        <label>
          <span>Base path</span>
          <input value={form.basePath} onChange={(event) => onFormChange("basePath", event.target.value)} placeholder="~" disabled={isBusy} />
        </label>
        <div className="remote-actions">
          <button type="submit" className="primary-button compact" disabled={isBusy || !form.address.trim()}>
            {status === "connecting" ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Server size={16} aria-hidden="true" />}
            Connect
          </button>
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={!isConnected || isBusy}>
            {status === "refreshing" ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            Refresh
          </button>
          <label className="live-toggle">
            <input type="checkbox" checked={isLive} onChange={(event) => onToggleLive(event.target.checked)} disabled={!isConnected} />
            <span>Live</span>
          </label>
          <label className="live-toggle">
            <input type="checkbox" checked={isAutoRepairEnabled} onChange={(event) => onToggleAutoRepair(event.target.checked)} disabled={!isConnected || isBusy} />
            <span>Auto repair · max {AUTO_REPAIR_MAX_ATTEMPTS}</span>
          </label>
        </div>
      </form>

      {error && (
        <div className="inline-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {machine ? (
        <>
          <div className="remote-summary">
            <div>
              <span>Host</span>
              <strong>{machine.hostname}</strong>
              <small>{machine.user}</small>
            </div>
            <div>
              <span>Current path</span>
              <strong>{machine.cwd}</strong>
              <small>Sampled {machine.sampledAt}</small>
            </div>
          </div>

          <div className="resource-grid" aria-label="Remote resource usage">
            <ResourceMeter icon={<Cpu size={18} />} label="CPU" value={`${machine.cpu.usagePct}%`} detail={`${machine.cpu.cores} cores · load ${machine.cpu.loadAverage}`} percent={machine.cpu.usagePct} />
            <ResourceMeter
              icon={<Activity size={18} />}
              label="Memory"
              value={`${machine.memory.usedPct}%`}
              detail={`${formatMb(machine.memory.usedMb)} / ${formatMb(machine.memory.totalMb)}`}
              percent={machine.memory.usedPct}
            />
            <ResourceMeter
              icon={<HardDrive size={18} />}
              label="Disk"
              value={`${machine.disk.usedPct}%`}
              detail={`${formatMb(machine.disk.usedMb)} / ${formatMb(machine.disk.totalMb)}`}
              percent={machine.disk.usedPct}
            />
            {machine.gpus.length === 0 ? (
              <ResourceMeter icon={<Activity size={18} />} label="GPU" value="None" detail="nvidia-smi not available" percent={0} />
            ) : (
              machine.gpus.map((gpu) => (
                <ResourceMeter
                  key={gpu.name}
                  icon={<Activity size={18} />}
                  label="GPU"
                  value={`${gpu.utilizationPct}%`}
                  detail={`${gpu.name} · ${formatMb(gpu.usedMemoryMb)} / ${formatMb(gpu.totalMemoryMb)}`}
                  percent={gpu.utilizationPct}
                />
              ))
            )}
          </div>

          <div className="coding-space-row">
            <label>
              <span>Coding space</span>
              <select value={selectedSpace?.path ?? ""} onChange={(event) => onSelectSpace(event.target.value)}>
                {spaces.map((space) => (
                  <option key={space.path} value={space.path}>
                    {space.name} · {space.path}
                  </option>
                ))}
              </select>
            </label>
            <span className="space-badge">
              <FolderOpen size={14} aria-hidden="true" />
              {selectedSpace?.path ?? "No space selected"}
            </span>
          </div>

          <div className="remote-interaction-grid">
            <div className="remote-coding-chat">
              <div className="remote-coding-chat-heading">
                <div>
                  <strong>Remote coding chat</strong>
                  <small>{selectedSpace ? `Runs in ${selectedSpace.path}` : "Select a coding space first"}</small>
                </div>
                <span>{chatMessages.length} messages</span>
              </div>

              <div className="coding-chat-actions" aria-label="Remote coding quick commands">
                <button type="button" className="ghost-button" onClick={() => onChatInputChange("使用 multi-agent plan-do-react-verify 模式自动安全安装实验环境：先 deep search README/setup/environment/requirements/pyproject 和 setup.sh --help，再规划创建新的 conda env，执行安装，失败后自动分析报错并多轮修复直到 verify 通过或达到上限")} disabled={!hasSelectedSpace || isChatRunning}>
                  Safe install
                </button>
                <button type="button" className="ghost-button" onClick={() => onChatInputChange("查看远程环境和当前目录")} disabled={!hasSelectedSpace || isChatRunning}>
                  Check env
                </button>
                <button type="button" className="ghost-button" onClick={() => onChatInputChange("根据上一次失败日志生成安全修复命令，并继续 verify")} disabled={!hasSelectedSpace || isChatRunning || !commandResult || commandResult.exitCode === 0}>
                  Fix last error
                </button>
                <button type="button" className="ghost-button" onClick={() => onChatInputChange("跑实验")} disabled={!hasSelectedSpace || isChatRunning}>
                  Run experiment
                </button>
              </div>

              <div className="coding-safety-rail" aria-label="Coding safety rails">
                <span>No root</span>
                <span>Space-local HOME/cache</span>
                <span>No system package manager</span>
                <span>Deep search first</span>
                <span>Plan Do React Verify</span>
                <span>Auto repair max {AUTO_REPAIR_MAX_ATTEMPTS}</span>
                <span>Verify after repair</span>
              </div>

              <div className="coding-chat-log" aria-label="Remote coding chat log">
                {chatMessages.length === 0 ? (
                  <InlineEmpty message="连接服务器并选择 coding space 后，可以输入自然语言指令生成命令草案；用 $ 开头可以直接执行 shell 命令。" />
                ) : (
                  chatMessages.map((message) => (
                    <article key={message.id} className={`coding-chat-message ${message.role}`}>
                      <strong>{message.role === "user" ? "You" : "Remote Coding Agent"}</strong>
                      <p>{message.content}</p>
                      {message.command && <pre className="coding-chat-command">{message.command}</pre>}
                      {message.pendingCommand && (
                        <div className="pending-command-box">
                          <pre className="coding-chat-command">{message.pendingCommand}</pre>
                          <div className="pending-command-actions">
                            <button type="button" className="secondary-button" onClick={() => onExecutePendingCommand(message.id, message.pendingCommand!)} disabled={isChatRunning || !hasSelectedSpace}>
                              {isChatRunning ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                              Execute
                            </button>
                            <button type="button" className="ghost-button" onClick={() => onDismissPendingCommand(message.id)} disabled={isChatRunning}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {message.result && (
                        <div className="coding-chat-result">
                          <span>Exit {message.result.exitCode} · {formatElapsed(message.result.elapsedMs)} · {message.result.finishedAt}</span>
                          <pre>{[message.result.stdout, message.result.stderr].filter(Boolean).join("\n") || "No output."}</pre>
                      </div>
                      )}
                    </article>
                  ))
                )}
              </div>

              <form className="coding-chat-form" onSubmit={onChatSubmit}>
                <textarea
                  value={chatInput}
                  onChange={(event) => onChatInputChange(event.target.value)}
                  placeholder={selectedBaseRepo ? "例如：安装选中的 GitHub 项目并跑 smoke test" : "例如：创建一个 scripts/run_smoke.sh 并检查 Python 环境"}
                  disabled={!hasSelectedSpace || isChatRunning}
                />
                <button type="submit" className="secondary-button" disabled={!hasSelectedSpace || isChatRunning || !chatInput.trim()}>
                  {isChatRunning ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                  Send remote instruction
                </button>
              </form>
            </div>

            <div className="stream-terminal" aria-label="Streaming command output">
              <div className="stream-terminal-heading">
                <div>
                  <strong>Streaming output</strong>
                  <span>{status === "running" ? "Running" : streamLines.length > 0 ? `${streamLines.length} chunks` : "Idle"}</span>
                </div>
                <CircularProgress progress={taskProgress} />
              </div>
              <div className="stream-progress-meta">
                <strong>{taskProgress.label}</strong>
                <span>{commandResult ? `Last exit ${commandResult.exitCode}` : selectedSpace ? selectedSpace.path : "No coding space"}</span>
              </div>
              {streamLines.length === 0 ? (
                <InlineEmpty message="执行远程命令后，stdout/stderr 会实时流式显示在这里。" />
              ) : (
                <pre>
                  {streamLines.map((line) => `[${formatElapsed(line.elapsedMs)}] ${line.stream}> ${line.text}`).join("\n")}
                </pre>
              )}
            </div>
          </div>
        </>
      ) : (
        <InlineEmpty message="输入 SSH 地址后连接。连接使用本机 ssh 配置、key 或 agent；当前不会在页面中收集密码。" />
      )}
    </section>
  );
}

function ResourceMeter({ icon, label, value, detail, percent }: { icon: React.ReactNode; label: string; value: string; detail: string; percent: number }) {
  return (
    <article className="resource-meter">
      <span aria-hidden="true">{icon}</span>
      <div>
        <div className="resource-heading">
          <strong>{label}</strong>
          <b>{value}</b>
        </div>
        <div className="meter-track" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function CircularProgress({ progress }: { progress: RemoteTaskProgress }) {
  return (
    <div
      className={`progress-ring ${progress.tone}`}
      style={{ "--progress": `${progress.percent}%` } as React.CSSProperties}
      aria-label={`Remote task progress ${progress.percent} percent`}
    >
      <span>{progress.percent}%</span>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function PanelTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action: string }) {
  return (
    <div className="panel-title">
      <div>
        <span aria-hidden="true">{icon}</span>
        <h2>{title}</h2>
      </div>
      <button type="button" className="ghost-button">
        {action}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function NodeDetail({ node }: { node: TaskNode }) {
  return (
    <div className="node-detail">
      <div>
        <p className="eyebrow">{node.agent}</p>
        <h3>{node.label}</h3>
        <p>{node.summary}</p>
      </div>
      <div className="io-grid">
        <div>
          <span>Input</span>
          <p>{node.input}</p>
        </div>
        <div>
          <span>Output</span>
          <p>{node.output}</p>
        </div>
        <div>
          <span>Artifact</span>
          <p>{node.artifact}</p>
        </div>
      </div>
    </div>
  );
}

function NodeAction({
  node,
  selectedIdea
}: {
  node: TaskNode;
  selectedIdea: Idea | null;
}) {
  if (node.id !== "coding") {
    return null;
  }

  if (!selectedIdea) {
    return <InlineEmpty message="先在 Idea Workspace 选择一个 idea，才能进入 Coding。" />;
  }

  if (node.status === "done") {
    return (
      <div className="node-action complete">
        <Check size={16} aria-hidden="true" />
        <span>代码计划已生成，可以继续查看 Experiment 节点。</span>
      </div>
    );
  }

  return (
    <div className="node-action">
      <div>
        <strong>Coding setup</strong>
        <p>已选择 {selectedIdea.title}。请在 Coding Workspace 中选择开发机器和可选 base repo。</p>
      </div>
    </div>
  );
}

function GraphNode({
  node,
  isSelected,
  isLast,
  onSelect
}: {
  node: TaskNode;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="graph-node-wrap">
      <button type="button" className={`graph-node ${node.status} ${isSelected ? "selected" : ""}`} onClick={onSelect}>
        <span className={`node-icon ${getNodeStatusTone(node.status)}`}>{getNodeStatusIcon(node.status)}</span>
        <strong>{node.label}</strong>
        <small>{statusLabels[node.status]}</small>
      </button>
      {!isLast && <div className="graph-connector" aria-hidden="true" />}
    </div>
  );
}

function summarizeNonJsonResponse(text: string) {
  const withoutScripts = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const normalized = withoutTags.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 220) || "Non-JSON response returned by the server.";
}

function WorkspaceTabs({
  nodes,
  selectedNodeId,
  onSelect
}: {
  nodes: TaskNode[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <section className="workspace-tabs" role="tablist" aria-label="Task detail pages">
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;

        return (
          <button
            key={node.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`workspace-tab ${node.status} ${isSelected ? "active" : ""}`}
            onClick={() => onSelect(node.id)}
          >
            <span className={`node-icon ${getNodeStatusTone(node.status)}`}>{getNodeStatusIcon(node.status)}</span>
            <span>
              <strong>{node.label}</strong>
              <small>{statusLabels[node.status]}</small>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function InlineEmpty({ message }: { message: string }) {
  return <div className="inline-empty">{message}</div>;
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="result-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function getNodeOrder(id: string) {
  const index = nodeStatusOrder.indexOf(id);
  return index >= 0 ? index : nodeStatusOrder.length + 1;
}

function selectWorkspaceIdea(workspace: WorkspaceTask, ideaId: string): WorkspaceTask {
  const selectedIdea = workspace.ideas.find((idea) => idea.id === ideaId);

  if (!selectedIdea) {
    return workspace;
  }

  const ideas = workspace.ideas.map((idea) => selectIdea(idea, ideaId));
  const codingNode = workspace.nodes.find((node) => node.id === "coding");
  const nodes = workspace.nodes.map((node) => {
    if (node.id !== "idea") {
      return node;
    }

    return {
      ...node,
      status: "done" as const,
      summary: `已选择 ${selectedIdea.title}。`,
      output: selectedIdea.hypothesis,
      artifact: `selected:${selectedIdea.id}`
    };
  });

  return {
    ...workspace,
    ideas,
    nodes,
    task: {
      ...workspace.task,
      activeNodeId: codingNode ? "coding" : workspace.task.activeNodeId,
      progress: Math.max(workspace.task.progress, 45),
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false })
    }
  };
}

function selectIdea(idea: Idea, selectedIdeaId: string): Idea {
  if (idea.id === selectedIdeaId) {
    return { ...idea, status: "selected" };
  }

  if (idea.status === "selected") {
    return { ...idea, status: "candidate" };
  }

  return idea;
}

function applyIdeaChatUpdateToWorkspace(workspace: WorkspaceTask, ideas: Idea[], ideaChatMessages: IdeaChatMessage[]): WorkspaceTask {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const selectedIdea = ideas.find((idea) => idea.status === "selected") ?? null;
  const previousSelectedIdea = workspace.ideas.find((idea) => idea.status === "selected") ?? null;
  const selectedIdeaChanged = hasSelectedIdeaChanged(previousSelectedIdea, selectedIdea);
  const nodes = workspace.nodes.map((node) => {
    if (node.id === "idea") {
      return {
        ...node,
        status: selectedIdea ? ("done" as const) : ("pending" as const),
        summary: selectedIdea ? `Idea chat 已更新并选择 ${selectedIdea.title}。` : `Idea chat 已更新 ${ideas.length} 个候选 idea，等待选择。`,
        output: selectedIdea?.hypothesis ?? ideas.map((idea) => idea.title).join("；"),
        artifact: selectedIdea ? `selected:${selectedIdea.id}` : "ideas-updated"
      };
    }

    if (node.id === "coding" && selectedIdeaChanged && node.status === "done") {
      return {
        ...node,
        status: "pending" as const,
        summary: "选中的 idea 已被编辑，建议重新生成 coding plan。",
        output: "Idea 已更新，请在 Coding Workspace 重新生成代码计划。",
        artifact: "pending"
      };
    }

    return node;
  });

  return {
    ...workspace,
    ideas,
    ideaChatMessages,
    nodes,
    task: {
      ...workspace.task,
      activeNodeId: "idea",
      progress: selectedIdea ? Math.max(workspace.task.progress, 45) : Math.max(workspace.task.progress, 40),
      updatedAt: now
    },
    agentRuns: [
      {
        id: `run-idea-${Date.now()}`,
        agent: "Idea Agent",
        status: "done" as const,
        startedAt: now,
        message: selectedIdea ? `已通过对话更新候选 idea，并选择 ${selectedIdea.title}。` : `已通过对话更新 ${ideas.length} 个候选 idea。`,
        toolCalls: ["workspace.idea_chat", selectedIdea ? "workspace.select_idea" : "workspace.update_ideas"]
      },
      ...workspace.agentRuns.filter((run) => run.agent !== "Idea Agent" || run.status !== "done")
    ]
  };
}

function hasSelectedIdeaChanged(previousIdea: Idea | null, nextIdea: Idea | null) {
  if (!previousIdea && !nextIdea) {
    return false;
  }

  if (!previousIdea || !nextIdea || previousIdea.id !== nextIdea.id) {
    return true;
  }

  return (
    previousIdea.title !== nextIdea.title ||
    previousIdea.hypothesis !== nextIdea.hypothesis ||
    previousIdea.methodSketch !== nextIdea.methodSketch ||
    previousIdea.expectedEvidence.join("\n") !== nextIdea.expectedEvidence.join("\n")
  );
}

function advanceWorkspaceCoding(workspace: WorkspaceTask, setup: CodingPlanSetup): WorkspaceTask {
  const selectedIdea = workspace.ideas.find((idea) => idea.status === "selected");

  if (!selectedIdea) {
    return workspace;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const codingPlan = createCodingPlan(selectedIdea, setup);
  const nodes = workspace.nodes.map((node) => {
    if (node.id === "coding") {
      return {
        ...node,
        status: "done" as const,
        summary: `已基于 ${selectedIdea.title} 生成最小实现计划，开发空间为 ${setup.space.path}。`,
        input: `${selectedIdea.methodSketch}\n开发机器：${setup.machine.hostname}\nCoding space：${setup.space.path}`,
        output: codingPlan,
        artifact: `coding-plan-${selectedIdea.id}.md`
      };
    }

    return node;
  });

  const agentRuns = [
    {
      id: `run-coding-${Date.now()}`,
      agent: "Coding Agent",
      status: "done" as const,
      startedAt: now,
      message: `已为 ${selectedIdea.title} 在 ${setup.machine.hostname}:${setup.space.path} 生成代码模块拆解、实验入口和验收检查。`,
      toolCalls: ["workspace.select_remote_machine", setup.baseRepo ? "workspace.select_base_repo" : "workspace.skip_base_repo", "workspace.generate_coding_plan"]
    },
    ...workspace.agentRuns.filter((run) => run.agent !== "Coding Agent" || run.status !== "done")
  ];

  return {
    ...workspace,
    nodes,
    agentRuns,
    task: {
      ...workspace.task,
      activeNodeId: "coding",
      progress: Math.max(workspace.task.progress, 60),
      updatedAt: now
    }
  };
}

function createCodingPlan(idea: Idea, setup: CodingPlanSetup) {
  const baseRepoLine = setup.baseRepo
    ? `Base repo：${setup.baseRepo.name} (${setup.baseRepo.url})，来源论文：${setup.baseRepo.sourcePaperTitle}`
    : "Base repo：不使用 survey GitHub 仓库，直接在选定 coding space 中开发。";

  return [
    `目标：围绕「${idea.title}」实现一个最小可验证原型。`,
    `核心假设：${idea.hypothesis}`,
    `实现草图：${idea.methodSketch}`,
    `开发机器：${setup.machine.hostname}（${setup.machine.user}）`,
    `Coding space：${setup.space.path}`,
    baseRepoLine,
    "模块拆解：1. 数据与配置入口；2. 方法核心模块；3. baseline 对照；4. 评估脚本；5. 结果记录。",
    "安全安装流程：自动搜索 README、setup.sh、environment.yml、requirements.txt、pyproject.toml；在 Coding space 内创建新的 conda env 和本地 cache 后安装依赖。",
    "自动排障流程：命令失败后捕获 stdout/stderr，由 Remote Coding Agent 生成最小修复命令草案；修复命令必须再次由用户确认后执行。",
    "优先产物：训练或推理入口、实验配置文件、指标计算脚本、README 复现实验命令。",
    `验收证据：${idea.expectedEvidence.length > 0 ? idea.expectedEvidence.join("；") : "至少产出一组可复现实验日志。"}`
  ].join("\n");
}

function getNodeStatusIcon(status: TaskNode["status"]) {
  if (status === "done") {
    return <Check size={18} aria-hidden="true" />;
  }

  if (status === "failed" || status === "blocked") {
    return <X size={18} aria-hidden="true" />;
  }

  return <Clock3 size={18} aria-hidden="true" />;
}

function getNodeStatusTone(status: TaskNode["status"]) {
  if (status === "done") {
    return "completed";
  }

  if (status === "failed" || status === "blocked") {
    return "failed";
  }

  return "waiting";
}

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) {
    return `${elapsedMs} ms`;
  }

  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

function getRemoteTaskProgress(status: RemoteStatus, streamLines: RemoteStreamLine[], result: RemoteCommandResult | null): RemoteTaskProgress {
  const text = [streamLines.map((line) => line.text).join("\n"), result?.stdout ?? "", result?.stderr ?? ""].join("\n").toLowerCase();
  let percent = status === "running" ? 8 : 0;
  let label = status === "running" ? "Starting remote task" : "Idle";

  const milestones: Array<{ pattern: RegExp; percent: number; label: string }> = [
    { pattern: /__agentic_guard__|agentic safe environment install|running in/, percent: 8, label: "Starting guarded run" },
    { pattern: /deep search|search agent|== search ==/, percent: 14, label: "Deep searching setup" },
    { pattern: /hardware and tools|nvidia-smi|gpu|python:|node:|npm:/, percent: 20, label: "Inspecting machine" },
    { pattern: /repository|git status|git clone|git pull/, percent: 32, label: "Preparing repository" },
    { pattern: /install hints|readme|requirements|pyproject|setup\.py/, percent: 44, label: "Reading project setup" },
    { pattern: /== plan ==|planner agent|strategy|failure type/, percent: 50, label: "Planning install strategy" },
    { pattern: /conda environment|conda env|micromamba|mamba|creating environment|conda env already exists/, percent: 58, label: "Creating conda environment" },
    { pattern: /== do ==|executor agent|setup\.sh args|environment\.ya?ml/, percent: 66, label: "Executing install plan" },
    { pattern: /pip install|installing collected packages|npm install|successfully installed/, percent: 76, label: "Installing dependencies" },
    { pattern: /== react ==|react agent|auto repair|failed logs/, percent: 84, label: "Reacting to failures" },
    { pattern: /pip check|verify|torch|cuda|environment ready/, percent: 92, label: "Verifying environment" }
  ];

  for (const milestone of milestones) {
    if (milestone.pattern.test(text) && milestone.percent >= percent) {
      percent = milestone.percent;
      label = milestone.label;
    }
  }

  if (result) {
    if (/no conda\/mamba\/micromamba found|environment not ready|no python dependency manifest|missing_core|torch:\s*missing|numpy:\s*missing|setup\.sh detected/.test(text)) {
      return { percent: 95, label: "Install incomplete", tone: "error" };
    }

    return result.exitCode === 0
      ? { percent: 100, label: "Completed", tone: "success" }
      : { percent: Math.max(percent, 95), label: "Failed, repair draft available", tone: "error" };
  }

  if (status === "running") {
    return { percent: Math.min(percent, 95), label, tone: "running" };
  }

  return { percent, label, tone: percent > 0 ? "running" : "idle" };
}

function formatMb(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} TB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${value} MB`;
}

function getSurveyGithubRepositories(papers: WorkspaceTask["planner"]["papers"]): SurveyGithubRepository[] {
  const repositories = new Map<string, SurveyGithubRepository>();

  for (const paper of papers) {
    const url = normalizeGithubUrl(paper.codeUrl);

    if (!url || repositories.has(url)) {
      continue;
    }

    repositories.set(url, {
      id: `repo-${repositories.size + 1}`,
      name: getGithubRepositoryName(url),
      url,
      sourcePaperTitle: paper.title
    });
  }

  return Array.from(repositories.values());
}

function createRemoteCodingInstruction(message: string, baseRepo: SurveyGithubRepository | null, idea: Idea | null): RemoteCodingInstruction {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  const rawCommand = parseRawRemoteCommand(normalized);

  if (rawCommand) {
    return { command: rawCommand };
  }

  if (/安全安装|实验环境|环境安装|依赖|setup|install|安装|部署|clone|克隆|github/.test(lower)) {
    return { needsPlanning: true, autoExecutePlannedCommand: true };
  }

  if (/修复|报错|失败|解决|retry|fix|error/.test(lower)) {
    return { needsPlanning: true };
  }

  if (/环境|状态|查看|检查|check|env|status|pwd|list/.test(lower)) {
    return { command: createEnvironmentCheckCommand(baseRepo) };
  }

  if (/实验|运行|跑|train|eval|test|experiment|benchmark/.test(lower)) {
    return { command: createRunExperimentCommand(baseRepo, idea) };
  }

  return { needsPlanning: true };
}

function parseRawRemoteCommand(message: string) {
  const trimmed = message.trim();

  if (trimmed.startsWith("$")) {
    return trimmed.slice(1).trim();
  }

  const commandPrefix = trimmed.match(/^(cmd|command|run)\s*:\s*(.+)$/i);
  return commandPrefix?.[2]?.trim() ?? "";
}

function createSafeEnvironmentInstallCommand(repo: SurveyGithubRepository | null, idea: Idea | null) {
  const repoDir = repo ? getGithubRepositoryDirectory(repo.url) : "";
  const setupRepoLines = repo
    ? [
        `REPO_URL=${shellQuoteForRemote(repo.url)}`,
        `REPO_DIR=${shellQuoteForRemote(repoDir)}`,
        "if [ -d \"$REPO_DIR/.git\" ]; then",
        "  cd \"$REPO_DIR\"",
        "  git status --short",
        "  git pull --ff-only || { echo 'git pull failed; keeping current checkout for safety.'; git status --short; }",
        "else",
        "  git clone \"$REPO_URL\" \"$REPO_DIR\"",
        "  cd \"$REPO_DIR\"",
        "fi"
      ]
    : ["PROJECT_DIR=$(pwd -P)", "cd \"$PROJECT_DIR\""];
  const ideaLine = idea ? `printf 'Selected idea: %s\\n' ${shellQuoteForRemote(idea.title)}` : "true";

  return [
    "set -Eeuo pipefail",
    "printf '== Agentic safe environment install ==\\n'",
    "if [ \"$(id -u)\" = \"0\" ]; then echo 'Refuse root user.' >&2; exit 12; fi",
    "SPACE_ROOT=${AGENTIC_CODING_SPACE:-$(pwd -P)}",
    ...setupRepoLines,
    "PROJECT_ROOT=$(pwd -P)",
    "case \"$PROJECT_ROOT\" in \"$SPACE_ROOT\"|\"$SPACE_ROOT\"/*) ;; *) echo 'Project escaped coding space; abort.' >&2; exit 13;; esac",
    ideaLine,
    "printf '\\n== Repository ==\\n'",
    "pwd",
    "git status --short || true",
    "printf '\\n== Hardware and tools ==\\n'",
    "for tool in git conda mamba micromamba python3 python pip3 pip node npm nvidia-smi; do printf '%s: ' \"$tool\"; command -v \"$tool\" || true; done",
    "PYTHON_BOOTSTRAP=$(command -v python3 || command -v python || true)",
    "if [ -z \"$PYTHON_BOOTSTRAP\" ]; then echo 'No python/python3 found for setup discovery.' >&2; exit 20; fi",
    "nvidia-smi 2>/dev/null || echo 'nvidia-smi not available'",
    "printf '\\n== Search install methods ==\\n'",
    "find . -maxdepth 3 -type f \\( -iname 'readme*' -o -iname 'setup.sh' -o -iname 'requirements*.txt' -o -iname 'pyproject.toml' -o -iname 'setup.py' -o -iname 'environment.yml' -o -iname 'environment.yaml' -o -path './docs/*' \\) -print | sort | head -n 80",
    "printf '\\n== Install hints from docs ==\\n'",
    "find . -maxdepth 2 -type f \\( -iname 'readme*' -o -path './docs/*' \\) -print | head -n 12 | while read -r file; do echo \"-- $file\"; grep -nEi 'install|setup|requirements|conda|mamba|pip|cuda|pytorch|environment|setup.sh' \"$file\" | head -n 24 || true; done",
    "CONDA_BIN=$(command -v micromamba || command -v mamba || command -v conda || true)",
    "if [ -z \"$CONDA_BIN\" ]; then for candidate in \"${CONDA_EXE:-}\" \"$SPACE_ROOT/.micromamba/bin/micromamba\" \"${HOME:-}/.local/bin/micromamba\" \"${HOME:-}/micromamba/bin/micromamba\" /opt/conda/bin/mamba /opt/conda/bin/conda /usr/local/bin/micromamba /usr/local/bin/mamba /usr/local/bin/conda; do if [ -n \"$candidate\" ] && [ -x \"$candidate\" ]; then CONDA_BIN=\"$candidate\"; break; fi; done; fi",
    "if [ -z \"$CONDA_BIN\" ]; then echo 'No conda/mamba/micromamba found; cannot create requested new env.' >&2; exit 21; fi",
    "CONDA_KIND=$(basename \"$CONDA_BIN\")",
    "PROJECT_SLUG=$(basename \"$PROJECT_ROOT\" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_' '-' | sed 's/^-*//; s/-*$//; s/--*/-/g')",
    "CONDA_ENV_NAME=agentic-${PROJECT_SLUG:-research}",
    "export CONDA_ENVS_PATH=\"$SPACE_ROOT/.conda/envs\"",
    "export CONDA_PKGS_DIRS=\"$SPACE_ROOT/.conda/pkgs\"",
    "export MAMBA_ROOT_PREFIX=\"$SPACE_ROOT/.micromamba\"",
    "mkdir -p \"$CONDA_ENVS_PATH\" \"$CONDA_PKGS_DIRS\" \"$MAMBA_ROOT_PREFIX\"",
    "printf '\\n== Conda environment ==\\n'",
    "echo \"manager=$CONDA_KIND env=$CONDA_ENV_NAME envs_path=$CONDA_ENVS_PATH\"",
    "if ! \"$CONDA_BIN\" env list 2>/dev/null | awk '{print $1}' | grep -Fx \"$CONDA_ENV_NAME\" >/dev/null; then \"$CONDA_BIN\" create -y -n \"$CONDA_ENV_NAME\" python=3.10; else echo \"Conda env already exists; reusing $CONDA_ENV_NAME\"; fi",
    "conda_run() { \"$CONDA_BIN\" run -n \"$CONDA_ENV_NAME\" \"$@\"; }",
    "conda_run python -m pip install --upgrade pip setuptools wheel packaging",
    "INSTALL_READY=1",
    "INSTALL_ACTION=none",
    "if [ -f environment.yml ]; then INSTALL_ACTION=environment.yml; \"$CONDA_BIN\" env update -n \"$CONDA_ENV_NAME\" -f environment.yml; ",
    "elif [ -f environment.yaml ]; then INSTALL_ACTION=environment.yaml; \"$CONDA_BIN\" env update -n \"$CONDA_ENV_NAME\" -f environment.yaml; ",
    "elif [ -f setup.sh ]; then INSTALL_ACTION=setup.sh; SETUP_ARGS=$(\"$PYTHON_BOOTSTRAP\" - <<'PY'\nfrom pathlib import Path\nimport subprocess\nallowed = ['--basic', '--xformers', '--flash-attn', '--diffoctreerast', '--spconv', '--mipgaussian', '--kaolin', '--nvdiffrast']\ntexts = []\nfor name in ('README.md', 'README.rst', 'README.txt'):\n    path = Path(name)\n    if path.exists():\n        texts.append(path.read_text(errors='ignore'))\ntry:\n    help_text = subprocess.run(['bash', 'setup.sh', '--help'], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30).stdout\n    texts.append(help_text)\nexcept Exception:\n    pass\njoined = '\\n'.join(texts)\nflags = [flag for flag in allowed if flag in joined]\nprint(' '.join(flags or ['--basic']))\nPY\n); echo \"setup.sh args: $SETUP_ARGS\"; CONDA_BASE=$(\"$CONDA_BIN\" info --base 2>/dev/null || true); if [ -n \"$CONDA_BASE\" ] && [ -f \"$CONDA_BASE/etc/profile.d/conda.sh\" ]; then set +u; . \"$CONDA_BASE/etc/profile.d/conda.sh\"; conda activate \"$CONDA_ENV_NAME\"; set -u; . ./setup.sh $SETUP_ARGS; else echo 'Cannot activate conda env for setup.sh; use repair chat to produce a reviewed command.' >&2; INSTALL_READY=0; fi; ",
    "elif [ -f requirements.txt ]; then INSTALL_ACTION=requirements.txt; conda_run python -m pip install -r requirements.txt; ",
    "elif [ -f pyproject.toml ]; then INSTALL_ACTION=pyproject.toml; conda_run python -m pip install -e .; ",
    "elif [ -f setup.py ]; then INSTALL_ACTION=setup.py; conda_run python -m pip install -e .; ",
    "else INSTALL_READY=0; echo 'No Python dependency manifest found; environment created only.'; fi",
    "if [ -f package.json ] && command -v npm >/dev/null 2>&1; then npm install --ignore-scripts; fi",
    "printf '\\n== Verify ==\\n'",
    "conda_run python -m pip check",
    "set +e",
    "conda_run python - <<'PY'\nimport importlib.util, sys\nprint('python', sys.version.split()[0])\nfor name in ('torch', 'numpy', 'pandas'):\n    spec = importlib.util.find_spec(name)\n    print(f'{name}:', 'available' if spec else 'missing')\nif importlib.util.find_spec('torch'):\n    import torch\n    print('torch', torch.__version__, 'cuda', torch.cuda.is_available())\nPY",
    "VERIFY_IMPORT_EXIT=$?",
    "conda_run python - <<'PY'\nimport importlib.util, sys\nmissing = [name for name in ('torch', 'numpy') if importlib.util.find_spec(name) is None]\nif missing:\n    print('missing_core:', ', '.join(missing))\n    sys.exit(30)\nPY",
    "VERIFY_CORE_EXIT=$?",
    "set -e",
    "if [ \"$INSTALL_READY\" != \"1\" ] || [ \"$VERIFY_IMPORT_EXIT\" -ne 0 ] || [ \"$VERIFY_CORE_EXIT\" -ne 0 ]; then",
    "  printf '\\nEnvironment NOT ready. install_action=%s conda_env=%s\\n' \"$INSTALL_ACTION\" \"$CONDA_ENV_NAME\" >&2",
    "  echo 'Next step: ask Remote coding chat to repair this conda env using the failed logs.' >&2",
    "  exit 30",
    "fi",
    "printf '\\nEnvironment ready in conda env %s using %s\\n' \"$CONDA_ENV_NAME\" \"$INSTALL_ACTION\""
  ].join("\n");
}

function createAutoRepairVerifyCommand(repo: SurveyGithubRepository | null) {
  const repoDir = repo ? getGithubRepositoryDirectory(repo.url) : "";
  const enterRepoLine = repoDir ? `if [ -d ${shellQuoteForRemote(repoDir)} ]; then cd ${shellQuoteForRemote(repoDir)}; fi` : "true";

  return [
    "set -Eeuo pipefail",
    "printf '== Auto repair verify ==\\n'",
    "SPACE_ROOT=${AGENTIC_CODING_SPACE:-$(pwd -P)}",
    enterRepoLine,
    "PROJECT_ROOT=$(pwd -P)",
    "case \"$PROJECT_ROOT\" in \"$SPACE_ROOT\"|\"$SPACE_ROOT\"/*) ;; *) echo 'Verify escaped coding space; abort.' >&2; exit 33;; esac",
    "pwd",
    "CONDA_BIN=$(command -v micromamba || command -v mamba || command -v conda || true)",
    "if [ -z \"$CONDA_BIN\" ]; then for candidate in \"${CONDA_EXE:-}\" \"$SPACE_ROOT/.micromamba/bin/micromamba\" \"${HOME:-}/.local/bin/micromamba\" \"${HOME:-}/micromamba/bin/micromamba\" /opt/conda/bin/mamba /opt/conda/bin/conda /usr/local/bin/micromamba /usr/local/bin/mamba /usr/local/bin/conda; do if [ -n \"$candidate\" ] && [ -x \"$candidate\" ]; then CONDA_BIN=\"$candidate\"; break; fi; done; fi",
    "if [ -z \"$CONDA_BIN\" ]; then echo 'No conda/mamba/micromamba found during verify.' >&2; exit 31; fi",
    "export CONDA_ENVS_PATH=\"$SPACE_ROOT/.conda/envs\"",
    "export CONDA_PKGS_DIRS=\"$SPACE_ROOT/.conda/pkgs\"",
    "export MAMBA_ROOT_PREFIX=\"$SPACE_ROOT/.micromamba\"",
    "mkdir -p \"$CONDA_ENVS_PATH\" \"$CONDA_PKGS_DIRS\" \"$MAMBA_ROOT_PREFIX\"",
    "PROJECT_SLUG=$(basename \"$PROJECT_ROOT\" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_' '-' | sed 's/^-*//; s/-*$//; s/--*/-/g')",
    "PRIMARY_ENV=agentic-${PROJECT_SLUG:-research}",
    "FALLBACK_ENV=${PROJECT_SLUG:-research}",
    "PRIMARY_ENV_PATH=\"$CONDA_ENVS_PATH/$PRIMARY_ENV\"",
    "FALLBACK_ENV_PATH=\"$CONDA_ENVS_PATH/$FALLBACK_ENV\"",
    "if \"$CONDA_BIN\" env list 2>/dev/null | awk '{print $1}' | grep -Fx \"$PRIMARY_ENV\" >/dev/null; then CONDA_RUN_SELECTOR=-n; CONDA_RUN_VALUE=\"$PRIMARY_ENV\"; elif \"$CONDA_BIN\" env list 2>/dev/null | awk '{print $1}' | grep -Fx \"$FALLBACK_ENV\" >/dev/null; then CONDA_RUN_SELECTOR=-n; CONDA_RUN_VALUE=\"$FALLBACK_ENV\"; elif [ -x \"$PRIMARY_ENV_PATH/bin/python\" ]; then CONDA_RUN_SELECTOR=-p; CONDA_RUN_VALUE=\"$PRIMARY_ENV_PATH\"; elif [ -x \"$FALLBACK_ENV_PATH/bin/python\" ]; then CONDA_RUN_SELECTOR=-p; CONDA_RUN_VALUE=\"$FALLBACK_ENV_PATH\"; else echo \"No expected conda env found: $PRIMARY_ENV or $FALLBACK_ENV under $CONDA_ENVS_PATH\" >&2; \"$CONDA_BIN\" env list || true; find \"$CONDA_ENVS_PATH\" -maxdepth 2 -type f -name python -print 2>/dev/null || true; exit 32; fi",
    "echo \"verify_env=$CONDA_RUN_SELECTOR $CONDA_RUN_VALUE\"",
    "conda_run() { \"$CONDA_BIN\" run \"$CONDA_RUN_SELECTOR\" \"$CONDA_RUN_VALUE\" \"$@\"; }",
    "conda_run python -m pip check",
    "conda_run python - <<'PY'\nimport importlib.util, sys\nprint('python', sys.version.split()[0])\nmissing = []\nfor name in ('torch', 'numpy'):\n    spec = importlib.util.find_spec(name)\n    print(f'{name}:', 'available' if spec else 'missing')\n    if spec is None:\n        missing.append(name)\nif importlib.util.find_spec('torch'):\n    import torch\n    print('torch', torch.__version__, 'cuda', torch.cuda.is_available())\nif missing:\n    print('missing_core:', ', '.join(missing))\n    sys.exit(30)\nPY",
    "printf 'Auto repair verify passed.\\n'"
  ].join("\n");
}

function createFailedRemoteCommandResult(command: string, cwd: string, message: string): RemoteCommandResult {
  return {
    command,
    cwd,
    exitCode: 1,
    stdout: "",
    stderr: message,
    elapsedMs: 0,
    finishedAt: new Date().toLocaleString("zh-CN", { hour12: false })
  };
}

function summarizeRemoteFailure(result: RemoteCommandResult) {
  const combined = [result.stderr, result.stdout].filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
  return combined ? combined.slice(-500) : `exit ${result.exitCode}`;
}

function formatRemotePlanMessage(plan: RemoteCommandPlanResponse, fallback: string, attempt?: number) {
  const lines = [attempt ? `Auto repair 第 ${attempt}/${AUTO_REPAIR_MAX_ATTEMPTS} 轮。` : fallback];

  if (plan.analysis?.trim()) {
    lines.push(`诊断：${plan.analysis.trim()}`);
  }

  if (plan.failureType?.trim()) {
    lines.push(`失败类型：${plan.failureType.trim()}`);
  }

  if (plan.strategy?.trim()) {
    lines.push(`策略：${plan.strategy.trim()}`);
  }

  appendPlanList(lines, "Multi-agent plan", plan.agentPlan);
  appendPlanList(lines, "Deep search", plan.deepSearchPlan);
  appendPlanList(lines, "Verify checklist", plan.verifyChecklist);

  if (plan.nextIfFails?.trim()) {
    lines.push(`失败后下一步：${plan.nextIfFails.trim()}`);
  }

  if (plan.explanation?.trim()) {
    lines.push(`命令说明：${plan.explanation.trim()}`);
  }

  return lines.join("\n");
}

function appendPlanList(lines: string[], label: string, items?: string[]) {
  const normalizedItems = items?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (normalizedItems.length === 0) {
    return;
  }

  lines.push(`${label}：${normalizedItems.map((item, index) => `${index + 1}. ${item}`).join(" ")}`);
}

function createEnvironmentCheckCommand(repo: SurveyGithubRepository | null) {
  return [
    "printf '== Location ==\\n'",
    "pwd",
    repo ? `if [ -d ${shellQuoteForRemote(getGithubRepositoryDirectory(repo.url))} ]; then cd ${shellQuoteForRemote(getGithubRepositoryDirectory(repo.url))}; fi` : "true",
    "printf '\\n== Project ==\\n'",
    "pwd",
    "ls -la | head -n 80",
    "printf '\\n== Tools ==\\n'",
    "for tool in git python python3 pip pip3 node npm nvidia-smi; do printf '%s: ' \"$tool\"; command -v \"$tool\" || true; done",
    "printf '\\n== GPU ==\\n'",
    "nvidia-smi 2>/dev/null || echo 'nvidia-smi not available'"
  ].join("\n");
}

function createRunExperimentCommand(repo: SurveyGithubRepository | null, idea: Idea | null) {
  const repoDir = repo ? getGithubRepositoryDirectory(repo.url) : "";
  const ideaLine = idea ? `echo ${shellQuoteForRemote(`Selected idea: ${idea.title}`)}` : "true";

  return [
    "set +e",
    repoDir ? `if [ -d ${shellQuoteForRemote(repoDir)} ]; then cd ${shellQuoteForRemote(repoDir)}; fi` : "true",
    ideaLine,
    "printf '== Experiment workspace ==\\n'",
    "pwd",
    "printf '\\n== Candidate entrypoints ==\\n'",
    "find . -maxdepth 3 -type f \\( -name '*train*.py' -o -name '*eval*.py' -o -name '*test*.py' -o -name '*experiment*.py' -o -name 'run*.sh' -o -name 'Makefile' -o -name 'package.json' \\) | head -n 80",
    "printf '\\n== Smoke run ==\\n'",
    "if [ -f scripts/run_experiment.sh ]; then bash scripts/run_experiment.sh; ",
    "elif [ -f run_experiment.sh ]; then bash run_experiment.sh; ",
    "elif [ -f Makefile ]; then make test || make run || true; ",
    "elif [ -f package.json ] && command -v npm >/dev/null 2>&1; then npm test || npm run test || true; ",
    "else echo 'No standard experiment entrypoint found. Use `$ <command>` to run a specific training/evaluation command.'; fi"
  ].join("\n");
}

function getGithubRepositoryDirectory(value: string) {
  try {
    const url = new URL(value);
    const [, repo = "repository"] = url.pathname.split("/").filter(Boolean);
    return repo.replace(/\.git$/i, "") || "repository";
  } catch {
    return "repository";
  }
}

function shellQuoteForRemote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeGithubUrl(value: string) {
  if (!isUsableUrl(value)) {
    return null;
  }

  try {
    const url = new URL(value);

    if (!url.hostname.toLowerCase().endsWith("github.com")) {
      return null;
    }

    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

function getGithubRepositoryName(value: string) {
  try {
    const url = new URL(value);
    const [owner = "github", repo = "repository"] = url.pathname.split("/").filter(Boolean);
    return `${owner}/${repo}`;
  } catch {
    return value;
  }
}

function isUsableUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
