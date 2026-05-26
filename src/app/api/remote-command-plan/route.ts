import { NextRequest, NextResponse } from "next/server";

import { generateText } from "@/lib/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RemoteCommandPlanBody = {
  message?: unknown;
  cwd?: unknown;
  ideaTitle?: unknown;
  ideaSketch?: unknown;
  baseRepoName?: unknown;
  baseRepoUrl?: unknown;
  failedCommand?: unknown;
  exitCode?: unknown;
  stdout?: unknown;
  stderr?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RemoteCommandPlanBody;
    const message = asString(body.message, "").trim();
    const cwd = asString(body.cwd, "~").trim() || "~";

    if (!message) {
      return NextResponse.json({ error: "Remote coding instruction is required." }, { status: 400 });
    }

    const output = await generateText({
      system: createSystemPrompt(),
      user: createUserPrompt({
        message,
        cwd,
        ideaTitle: asString(body.ideaTitle, ""),
        ideaSketch: asString(body.ideaSketch, ""),
        baseRepoName: asString(body.baseRepoName, ""),
        baseRepoUrl: asString(body.baseRepoUrl, ""),
        failedCommand: asString(body.failedCommand, ""),
        exitCode: asString(body.exitCode, ""),
        stdout: asString(body.stdout, ""),
        stderr: asString(body.stderr, "")
      }),
      validateText: validateCommandPlanOutput,
      timeoutMs: 60000
    });
    const parsed = parseJsonObject(output);
    const command = asString(parsed.command, "").trim();

    if (!command) {
      return NextResponse.json({ error: "LLM did not return a command." }, { status: 500 });
    }

    return NextResponse.json({
      analysis: asString(parsed.analysis, ""),
      failureType: asString(parsed.failureType, ""),
      strategy: asString(parsed.strategy, ""),
      agentPlan: asStringArray(parsed.agentPlan),
      deepSearchPlan: asStringArray(parsed.deepSearchPlan),
      verifyChecklist: asStringArray(parsed.verifyChecklist),
      nextIfFails: asString(parsed.nextIfFails, ""),
      command,
      explanation: asString(parsed.explanation, "已生成远程命令草案。")
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function createSystemPrompt() {
  return [
    "你是 Remote Coding Command Planner。",
    "你把用户的自然语言开发指令转换成一个可以在远程 Linux/macOS shell 中非交互执行的命令。",
    "命令会在用户已选择的 coding space 中执行；不要使用需要交互输入的命令。",
    "所有命令必须只影响当前 coding space：不要使用 sudo、su、doas、apt/yum/dnf/pacman/brew install、systemctl、service、mkfs、mount、dd 或读取私钥/密码/token。",
    "安装依赖时优先搜索 README、setup.sh、environment.yml、requirements.txt、pyproject.toml，并在当前 coding space 的新 conda env 中安装；不要修改系统 Python 或系统包。",
    "修复失败时输出最小修复命令，先诊断再修复，避免删除、覆盖或大范围移动文件；Auto repair mode 最多自动重试 3 次，每轮后系统会自动 verify。",
    "你必须先判断失败类型，再选择策略；不要在没有项目 env 的情况下直接运行 verify。",
    "处理环境安装时，使用虚拟 multi-agent 协作：Search Agent 深度搜索项目安装线索，Planner Agent 选择环境和安装策略，Executor Agent 生成安全命令，React Agent 根据错误收敛下一步，Verifier Agent 定义验收。",
    "安装或修复命令必须打印清晰阶段：== Deep Search ==、== Plan ==、== Do ==、== React ==、== Verify ==，并在命令内先收集 README/setup/help/env/requirements 线索，再创建/修复 env 和安装依赖。",
    "修复命令不得写入 /etc、/usr、/bin、/sbin、/lib、/lib64 或 /opt 等系统路径；允许只读取/执行已有 conda/mamba 二进制。",
    "如果需要进入 GitHub base repo，请使用输入中提供的 repo 目录名或 URL 推断目录。",
    "可以生成多行 shell 脚本；优先使用可检查、可回滚、输出清楚的命令。",
    "只输出 JSON 对象，不要输出 Markdown、解释、代码围栏或额外文字。"
  ].join("\n");
}

function createUserPrompt(context: {
  message: string;
  cwd: string;
  ideaTitle: string;
  ideaSketch: string;
  baseRepoName: string;
  baseRepoUrl: string;
  failedCommand: string;
  exitCode: string;
  stdout: string;
  stderr: string;
}) {
  return `
用户指令：${context.message}
远程当前目录：${context.cwd}
选中 idea：${context.ideaTitle || "无"}
idea 方法草图：${context.ideaSketch || "无"}
base repo 名称：${context.baseRepoName || "未选择"}
base repo URL：${context.baseRepoUrl || "未选择"}
上一次失败命令：${context.failedCommand || "无"}
上一次 exit code：${context.exitCode || "无"}
上一次 stdout 尾部：
${context.stdout || "无"}
上一次 stderr 尾部：
${context.stderr || "无"}

请返回：
{
  "analysis": "先用 1-3 句话分析失败日志、当前环境状态和最可能根因",
  "failureType": "initial_install | missing_conda_tool | missing_conda_env | dependency_import_missing | dependency_conflict | setup_script_failed | path_or_guard_issue | unknown",
  "strategy": "先做什么、为什么；如果是 missing_conda_env，必须先创建新的项目 env 再安装依赖",
  "agentPlan": ["Search Agent: ...", "Planner Agent: ...", "Executor Agent: ...", "React Agent: ...", "Verifier Agent: ..."],
  "deepSearchPlan": ["要搜索的安装文件、README 段落、setup.sh --help、env list、CUDA/PyTorch 线索"],
  "verifyChecklist": ["pip check", "torch/numpy import", "项目入口/README smoke check"],
  "nextIfFails": "如果这条命令失败，下一轮应该如何缩小问题空间",
  "command": "可直接在远程 shell 执行的命令或多行脚本",
  "explanation": "一句话说明这个命令会做什么，以及是否有风险"
}

约束：
- command 不要包含占位符。
- command 不要假设 sudo 权限。
- command 必须只在当前 coding space / repo 内操作；如果需要缓存或 HOME，请使用项目本地目录。
- command 必须体现 strategy；例如 failureType=missing_conda_env 时，第一步应创建/修复新的项目 conda env，而不是直接 verify。
- command 必须包含 Deep Search / Plan / Do / React / Verify 阶段输出；对于安装任务，先搜索 README、docs、setup.sh --help、environment.yml、requirements、pyproject、conda env list，再决定创建 env 和安装方式。
- 自动修复失败时，优先生成诊断 + 最小修复命令，不要直接重装整个系统环境；系统会在修复命令后自动运行 verify。
- 如果上一次 exit code 是 32，或日志包含 No expected conda env found，说明项目 conda env 缺失；优先在当前 coding space 的 .conda/envs 下创建/修复 agentic-<project> env，并按 README/setup.sh/environment.yml/requirements.txt 安装项目依赖。
- 如果连续失败，下一轮命令必须缩小范围并解释上一次失败原因，不能重复完全相同的命令。
- command 不要读取或打印 token、私钥、密码等敏感文件。
- 如果用户要求删除、覆盖、重装、大量移动文件，explanation 必须明确提示风险；command 仍应尽量先备份或列出目标。
`;
}

function validateCommandPlanOutput(text: string) {
  try {
    const parsed = parseJsonObject(text);
    return asString(parsed.command, "").trim() ? null : "missing command";
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

function asString(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item, "")).filter(Boolean).slice(0, 8);
}