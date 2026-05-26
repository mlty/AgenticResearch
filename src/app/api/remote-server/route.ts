import { execFile, spawn } from "node:child_process";

import { NextRequest, NextResponse } from "next/server";

import type { CodingSpace, RemoteCommandResult, RemoteMachineSnapshot } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RemoteAction = "connect" | "refresh" | "run";

type RemoteRequestBody = {
  action?: RemoteAction;
  address?: unknown;
  username?: unknown;
  port?: unknown;
  basePath?: unknown;
  cwd?: unknown;
  command?: unknown;
  timeoutMs?: unknown;
};

type RemoteConnection = {
  host: string;
  username: string;
  port: number;
  target: string;
};

type SshResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
};

type RemoteStreamEvent =
  | { type: "start"; message: string; elapsedMs: number }
  | { type: "stdout"; chunk: string; elapsedMs: number }
  | { type: "stderr"; chunk: string; elapsedMs: number }
  | { type: "result"; result: RemoteCommandResult }
  | { type: "error"; error: string; elapsedMs: number };

const DEFAULT_CONNECT_TIMEOUT_MS = 20000;
const DEFAULT_COMMAND_TIMEOUT_MS = 120000;
const MAX_COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_OUTPUT_LENGTH = 60000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RemoteRequestBody;
    const action = body.action ?? "connect";

    if (!isRemoteAction(action)) {
      return NextResponse.json({ error: "Unsupported remote server action." }, { status: 400 });
    }

    const connection = parseConnection(body);

    if (action === "run") {
      const cwd = asString(body.cwd, "~");
      const command = asString(body.command, "");
      const timeoutMs = parseCommandTimeout(body.timeoutMs);

      if (!command.trim()) {
        return NextResponse.json({ error: "Command is required." }, { status: 400 });
      }

      assertSafeRemoteCommand(cwd, command);

      if (wantsExecutionStream(request)) {
        return streamRemoteCommand(connection, cwd, command, timeoutMs);
      }

      const result = await runRemoteCommand(connection, cwd, command, timeoutMs);
      return NextResponse.json({ result });
    }

    const cwd = asString(body.cwd, asString(body.basePath, "~"));
    const basePath = asString(body.basePath, cwd || "~");
    const result = await runSsh(connection, createSnapshotCommand(basePath, cwd), DEFAULT_CONNECT_TIMEOUT_MS);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `ssh exited with code ${result.exitCode}`);
    }

    const parsed = parseSnapshotOutput(result.stdout);
    return NextResponse.json({ machine: parsed.machine, spaces: parsed.spaces, raw: result.stderr });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

function isRemoteAction(value: string): value is RemoteAction {
  return value === "connect" || value === "refresh" || value === "run";
}

function wantsExecutionStream(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/x-ndjson") || request.nextUrl.searchParams.get("stream") === "1";
}

function parseConnection(body: RemoteRequestBody): RemoteConnection {
  const addressInput = asString(body.address, "").trim();

  if (!addressInput) {
    throw new Error("SSH address is required.");
  }

  const parsedAddress = parseSshAddress(addressInput);
  const username = asString(body.username, parsedAddress.username).trim();
  const port = parsePort(body.port, parsedAddress.port);

  assertSafeHost(parsedAddress.host);

  if (username) {
    assertSafeUsername(username);
  }

  const target = username ? `${username}@${parsedAddress.host}` : parsedAddress.host;
  return { host: parsedAddress.host, username, port, target };
}

function parseSshAddress(value: string) {
  let address = value.trim();
  let username = "";
  let port: number | null = null;

  if (address.includes("@")) {
    const [rawUsername, ...rest] = address.split("@");
    username = rawUsername;
    address = rest.join("@");
  }

  if (!address.startsWith("[") && /:\d+$/.test(address)) {
    const separatorIndex = address.lastIndexOf(":");
    port = Number(address.slice(separatorIndex + 1));
    address = address.slice(0, separatorIndex);
  }

  if (address.startsWith("[") && address.includes("]")) {
    const closingIndex = address.indexOf("]");
    const host = address.slice(1, closingIndex);
    const suffix = address.slice(closingIndex + 1);

    if (/^:\d+$/.test(suffix)) {
      port = Number(suffix.slice(1));
    }

    address = host;
  }

  return { host: address, username, port };
}

function assertSafeHost(host: string) {
  if (!host || !/^[A-Za-z0-9._:-]+$/.test(host)) {
    throw new Error("SSH host contains unsupported characters.");
  }
}

function assertSafeUsername(username: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(username)) {
    throw new Error("SSH username contains unsupported characters.");
  }
}

function parsePort(value: unknown, fallback: number | null) {
  const port = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback ?? 22;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SSH port must be between 1 and 65535.");
  }

  return port;
}

async function runRemoteCommand(connection: RemoteConnection, cwd: string, command: string, timeoutMs: number): Promise<RemoteCommandResult> {
  const remoteCommand = createGuardedRemoteCommand(cwd, command);
  const result = await runSsh(connection, remoteCommand, timeoutMs);

  return {
    command,
    cwd,
    exitCode: result.exitCode,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    elapsedMs: result.elapsedMs,
    finishedAt: formatDateTime(new Date())
  };
}

function streamRemoteCommand(connection: RemoteConnection, cwd: string, command: string, timeoutMs: number) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        const startedAt = Date.now();
        let stdout = "";
        let stderr = "";
        let isClosed = false;
        const send = (event: RemoteStreamEvent) => {
          if (!isClosed) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        };
        const close = () => {
          if (!isClosed) {
            isClosed = true;
            controller.close();
          }
        };
        const child = spawn("ssh", createSshArgs(connection, createGuardedRemoteCommand(cwd, command)), { stdio: ["ignore", "pipe", "pipe"] });
        const timeout = setTimeout(() => {
          stderr = truncateForCollection(stderr, `\nCommand timed out after ${timeoutMs} ms.`);
          send({ type: "stderr", chunk: `\nCommand timed out after ${timeoutMs} ms.`, elapsedMs: Date.now() - startedAt });
          child.kill("SIGTERM");
        }, timeoutMs);

        send({ type: "start", message: `Running in ${cwd || "~"} with coding-space safety guards.`, elapsedMs: 0 });

        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stdout = truncateForCollection(stdout, text);
          send({ type: "stdout", chunk: text, elapsedMs: Date.now() - startedAt });
        });

        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stderr = truncateForCollection(stderr, text);
          send({ type: "stderr", chunk: text, elapsedMs: Date.now() - startedAt });
        });

        child.on("error", (error) => {
          clearTimeout(timeout);
          send({ type: "error", error: `Failed to start ssh: ${error.message}`, elapsedMs: Date.now() - startedAt });
          close();
        });

        child.on("close", (code) => {
          clearTimeout(timeout);
          send({
            type: "result",
            result: {
              command,
              cwd,
              exitCode: typeof code === "number" ? code : 1,
              stdout: truncate(stdout),
              stderr: truncate(stderr),
              elapsedMs: Date.now() - startedAt,
              finishedAt: formatDateTime(new Date())
            }
          });
          close();
        });
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

function createGuardedRemoteCommand(cwd: string, command: string) {
  return [
    `cd ${shellQuote(cwd || "~")} 2>/dev/null || exit 10`,
    "AGENTIC_CODING_SPACE=$(pwd -P)",
    "if [ \"$(id -u)\" = \"0\" ]; then echo 'Refusing to run as root in Agentic Research coding space.' >&2; exit 12; fi",
    "mkdir -p \"$AGENTIC_CODING_SPACE/.agentic-home\" \"$AGENTIC_CODING_SPACE/.cache/pip\" \"$AGENTIC_CODING_SPACE/.cache/npm\"",
    "export HOME=\"$AGENTIC_CODING_SPACE/.agentic-home\"",
    "export PIP_CACHE_DIR=\"$AGENTIC_CODING_SPACE/.cache/pip\"",
    "export npm_config_cache=\"$AGENTIC_CODING_SPACE/.cache/npm\"",
    "printf '__AGENTIC_GUARD__ coding_space=%s\\n' \"$AGENTIC_CODING_SPACE\"",
    command
  ].join("\n");
}

function createSshArgs(connection: RemoteConnection, remoteCommand: string) {
  return [
    "-p",
    String(connection.port),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
    connection.target,
    remoteCommand
  ];
}

function parseCommandTimeout(value: unknown) {
  const timeoutMs = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : DEFAULT_COMMAND_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }

  return Math.min(Math.round(timeoutMs), MAX_COMMAND_TIMEOUT_MS);
}

function runSsh(connection: RemoteConnection, remoteCommand: string, timeoutMs: number) {
  const startedAt = Date.now();
  const args = createSshArgs(connection, remoteCommand);

  return new Promise<SshResult>((resolve, reject) => {
    const child = execFile("ssh", args, { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_LENGTH * 2 }, (error, stdout, stderr) => {
      const exitCode = typeof (error as NodeJS.ErrnoException | null)?.code === "number" ? Number((error as NodeJS.ErrnoException).code) : 0;
      resolve({ stdout, stderr, exitCode, elapsedMs: Date.now() - startedAt });
    });

    child.on("error", (error) => reject(new Error(`Failed to start ssh: ${error.message}`)));
  });
}

function assertSafeRemoteCommand(cwd: string, command: string) {
  const normalizedCwd = cwd.trim();
  const normalizedCommand = command.replace(/\s+/g, " ").trim().toLowerCase();

  if (!normalizedCwd || normalizedCwd === "/") {
    throw new Error("Coding space must be a non-root directory.");
  }

  const blockedPatterns: Array<[RegExp, string]> = [
    [/\bsudo\b|\bsu\s+-?|\bdoas\b/, "Root escalation is blocked. Use a coding-space conda environment instead."],
    [/\b(?:apt|apt-get|yum|dnf|pacman|zypper)\s+(?:install|remove|upgrade)|\bbrew\s+install\b/, "System package installation is blocked in Coding Workspace."],
    [/\b(?:shutdown|reboot|halt|poweroff|systemctl|service)\b/, "System service operations are blocked."],
    [/\b(?:mkfs|mount|umount)\b|\bdd\s+if=/, "Disk and device operations are blocked."],
    [/rm\s+(?:-[a-z]*r[a-z]*f|-rf|-fr)\s+(?:\/|~|\$home|\*|\.\s*(?:$|;|&&|\|))/, "Destructive recursive deletion outside a specific project path is blocked."],
      [/(?:~\/\.ssh|\/\.ssh|id_rsa|id_ed25519|\.pem\b|\/etc\/shadow|\/etc\/sudoers)/, "Reading private keys or sensitive system files is blocked."],
      [/(?:^|[;&|]\s*)(?:rm|mv|cp|chmod|chown|mkdir|touch|ln|tee|truncate)\b[^;&|]*(?:\/etc|\/usr|\/bin|\/sbin|\/lib|\/lib64)(?:\/|\b)/, "Mutating system paths is blocked; operate only inside the coding space."],
      [/(?:^|[;&|]\s*)(?:rm|mv|cp|chmod|chown|mkdir|touch|ln|tee|truncate)\b[^;&|]*\/opt(?!\/conda\/bin)(?:\/|\b)/, "Mutating /opt is blocked; operate only inside the coding space."],
      [/>+\s*\/(?:etc|usr|bin|sbin|lib|lib64|opt)(?:\/|\b)/, "Writing to system paths is blocked; operate only inside the coding space."],
      [/\bnpm\s+(?:install|i)\s+-g\b|\b(?:pip|pip3)\s+install\b[^;&|]*(?:--user|--prefix\s+\/|--target\s+\/|--root\s+\/)/, "Global package installs are blocked; use coding-space local environments/cache."]
  ];

  for (const [pattern, message] of blockedPatterns) {
    if (pattern.test(normalizedCommand)) {
      throw new Error(message);
    }
  }
}

function createSnapshotCommand(basePath: string, cwd: string) {
  const quotedBasePath = shellQuote(basePath || "~");
  const quotedCwd = shellQuote(cwd || basePath || "~");

  return `
cd ${quotedCwd} 2>/dev/null || cd ~
printf '__FIELD__hostname\n'; hostname 2>/dev/null || true
printf '__FIELD__user\n'; whoami 2>/dev/null || true
printf '__FIELD__os\n'; uname -a 2>/dev/null || true
printf '__FIELD__cwd\n'; pwd 2>/dev/null || true
printf '__FIELD__cpu_cores\n'; (nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 0) | head -n 1
printf '__FIELD__cpu_model\n'; (awk -F: '/model name/ {gsub(/^ /, "", $2); print $2; exit}' /proc/cpuinfo 2>/dev/null || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown) | head -n 1
printf '__FIELD__load_average\n'; (cat /proc/loadavg 2>/dev/null | awk '{print $1" "$2" "$3}' || uptime 2>/dev/null || echo unknown) | head -n 1
printf '__FIELD__cpu_usage\n'; (top -bn1 2>/dev/null | awk '/Cpu\\(s\\)|%Cpu/ {for (i=1;i<=NF;i++) if ($i ~ /id/) {print 100-$(i-1); exit}}' || echo 0) | head -n 1
printf '__FIELD__memory\n'; (free -m 2>/dev/null | awk '/Mem:/ {print $2" "$3" "$7}' || echo '0 0 0') | head -n 1
printf '__FIELD__disk\n'; (df -Pm . 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $1" "$2" "$3" "$4" "$5}' || echo '. 0 0 0 0') | head -n 1
printf '__SECTION__gpus\n'; if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits 2>/dev/null || true; fi
printf '__SECTION__spaces\n'; base=${quotedBasePath}; [ -d "$base" ] || base="$HOME"; for d in "$base" "$base"/*; do [ -d "$d" ] && printf '%s\t%s\n' "$(basename "$d")" "$d"; done | head -n 40
`;
}

function parseSnapshotOutput(text: string): { machine: RemoteMachineSnapshot; spaces: CodingSpace[] } {
  const sections = parseSections(text);
  const cpuCores = toNumber(firstLine(sections.cpu_cores), 0);
  const cpuUsagePct = clamp(toNumber(firstLine(sections.cpu_usage), 0), 0, 100);
  const [totalMb, usedMb, availableMb] = splitNumbers(firstLine(sections.memory));
  const [mount = ".", diskTotal = "0", diskUsed = "0", diskAvailable = "0", diskPct = "0"] = firstLine(sections.disk).split(/\s+/);

  return {
    machine: {
      hostname: firstLine(sections.hostname) || "unknown",
      user: firstLine(sections.user) || "unknown",
      os: firstLine(sections.os) || "unknown",
      cwd: firstLine(sections.cwd) || "~",
      cpu: {
        model: firstLine(sections.cpu_model) || "unknown",
        cores: cpuCores,
        usagePct: cpuUsagePct,
        loadAverage: firstLine(sections.load_average) || "unknown"
      },
      memory: {
        totalMb,
        usedMb,
        availableMb,
        usedPct: totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0
      },
      disk: {
        mount,
        totalMb: toNumber(diskTotal, 0),
        usedMb: toNumber(diskUsed, 0),
        availableMb: toNumber(diskAvailable, 0),
        usedPct: clamp(toNumber(diskPct, 0), 0, 100)
      },
      gpus: parseGpus(sections.gpus ?? []),
      sampledAt: formatDateTime(new Date())
    },
    spaces: parseSpaces(sections.spaces ?? [])
  };
}

function parseSections(text: string) {
  const sections: Record<string, string[]> = {};
  let currentKey = "raw";

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("__FIELD__")) {
      currentKey = line.replace("__FIELD__", "");
      sections[currentKey] = [];
      continue;
    }

    if (line.startsWith("__SECTION__")) {
      currentKey = line.replace("__SECTION__", "");
      sections[currentKey] = [];
      continue;
    }

    if (!sections[currentKey]) {
      sections[currentKey] = [];
    }

    if (line.trim()) {
      sections[currentKey].push(line.trim());
    }
  }

  return sections;
}

function parseGpus(lines: string[]) {
  return lines.map((line) => {
    const [name = "GPU", totalMemoryMb = "0", usedMemoryMb = "0", utilizationPct = "0"] = line.split(",").map((item) => item.trim());
    return {
      name,
      totalMemoryMb: toNumber(totalMemoryMb, 0),
      usedMemoryMb: toNumber(usedMemoryMb, 0),
      utilizationPct: clamp(toNumber(utilizationPct, 0), 0, 100)
    };
  });
}

function parseSpaces(lines: string[]): CodingSpace[] {
  const spaces = lines
    .map((line) => {
      const [name, path] = line.split("\t");
      return name && path ? { name, path } : null;
    })
    .filter((item): item is CodingSpace => Boolean(item));

  return spaces.length > 0 ? spaces : [{ name: "home", path: "~" }];
}

function firstLine(lines: string[] | undefined) {
  return lines?.[0] ?? "";
}

function splitNumbers(value: string) {
  const [first = "0", second = "0", third = "0"] = value.split(/\s+/);
  return [toNumber(first, 0), toNumber(second, 0), toNumber(third, 0)] as const;
}

function shellQuote(value: string) {
  if (value === "~") {
    return value;
  }

  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function truncate(value: string) {
  return value.length > MAX_OUTPUT_LENGTH ? `${value.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]` : value;
}

function truncateForCollection(current: string, next: string) {
  const combined = current + next;
  return combined.length > MAX_OUTPUT_LENGTH ? combined.slice(combined.length - MAX_OUTPUT_LENGTH) : combined;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}