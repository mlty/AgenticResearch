import type { BackendExecutionLog } from "@/types/product";

type LlmRequest = {
  system: string;
  user: string;
  validateText?: (text: string) => string | null;
  onLog?: (entry: LlmLogEntry) => void;
  timeoutMs?: number;
};

type LlmLogEntry = Pick<BackendExecutionLog, "phase" | "status" | "message">;

type LlmAttempt = "chat-json" | "chat" | "responses";

type LlmErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

const DEFAULT_BASE_URL = "http://localhost:8313/v1";
const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_API_KEY = "dummy";
const DEFAULT_ENDPOINT_ORDER: LlmAttempt[] = ["chat-json", "chat"];

export async function generateText(request: LlmRequest) {
  const baseUrl = getBaseUrl();
  const model = process.env.LLM_API_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.LLM_API_KEY ?? DEFAULT_API_KEY;
  const endpointOrder = getEndpointOrder();
  const errors: string[] = [];

  request.onLog?.({
    phase: "llm.config",
    status: "success",
    message: `Model ${model}; base URL ${baseUrl}; endpoint order ${endpointOrder.map(formatAttemptName).join(" -> ")}.`
  });

  for (const endpoint of endpointOrder) {
    const label = formatAttemptName(endpoint);
    const startedAt = Date.now();

    request.onLog?.({
      phase: "llm.request",
      status: "running",
      message: `Calling ${label}.`
    });

    const result =
      endpoint === "responses"
        ? await callResponsesApi(baseUrl, apiKey, model, request)
        : await callChatCompletionsApi(baseUrl, apiKey, model, request, endpoint === "chat-json");
    const elapsedMs = Date.now() - startedAt;

    if (!result.ok) {
      errors.push(result.error);
      request.onLog?.({
        phase: "llm.request",
        status: "warning",
        message: `${label} failed after ${formatDuration(elapsedMs)}: ${result.error}`
      });
      continue;
    }

    const text = result.text.trim();

    if (!text) {
      const message = `${label} returned an empty response after ${formatDuration(elapsedMs)}.`;
      errors.push(message);
      request.onLog?.({ phase: "llm.response", status: "warning", message });
      continue;
    }

    const validationError = validateGeneratedText(text, request.validateText);

    if (validationError) {
      const message = `${label} returned unusable text after ${formatDuration(elapsedMs)}: ${validationError}`;
      errors.push(message);
      request.onLog?.({ phase: "llm.response", status: "warning", message });
      continue;
    }

    request.onLog?.({
      phase: "llm.response",
      status: "success",
      message: `${label} returned ${text.length} characters after ${formatDuration(elapsedMs)}.`
    });
    return text;
  }

  throw new Error(errors.filter(Boolean).join("\n") || "LLM request failed without a readable error.");
}

function getBaseUrl() {
  return (process.env.LLM_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getEndpointOrder() {
  const configured = process.env.LLM_API_ENDPOINT_ORDER;

  if (!configured) {
    return DEFAULT_ENDPOINT_ORDER;
  }

  const order = configured
    .split(",")
    .map((item) => normalizeAttemptName(item))
    .filter((item): item is LlmAttempt => Boolean(item));

  return order.length > 0 ? order : DEFAULT_ENDPOINT_ORDER;
}

function normalizeAttemptName(value: string): LlmAttempt | null {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");

  if (normalized === "chat-json" || normalized === "json") {
    return "chat-json";
  }

  if (normalized === "chat" || normalized === "chat-completions") {
    return "chat";
  }

  if (normalized === "responses" || normalized === "response") {
    return "responses";
  }

  return null;
}

function validateGeneratedText(text: string, validateText?: (text: string) => string | null) {
  if (!validateText) {
    return null;
  }

  try {
    return validateText(text);
  } catch (error) {
    return toErrorMessage(error);
  }
}

async function callResponsesApi(baseUrl: string, apiKey: string, model: string, request: LlmRequest) {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/responses`,
      {
        method: "POST",
        headers: createHeaders(apiKey),
        body: JSON.stringify({
          model,
          input: `${request.system}\n\n${request.user}`
        })
      },
      request.timeoutMs
    );

    const payload = await readJson(response);

    if (!response.ok) {
      return { ok: false as const, error: formatLlmError("Responses API", response.status, payload) };
    }

    return { ok: true as const, text: extractResponsesText(payload) };
  } catch (error) {
    return { ok: false as const, error: `Responses API error: ${formatRequestError(error, request.timeoutMs)}` };
  }
}

async function callChatCompletionsApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  request: LlmRequest,
  useJsonMode: boolean
) {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: createHeaders(apiKey),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user }
          ],
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {})
        })
      },
      request.timeoutMs
    );

    const payload = await readJson(response);

    if (!response.ok) {
      return { ok: false as const, error: formatLlmError("Chat Completions API", response.status, payload) };
    }

    return { ok: true as const, text: extractChatText(payload) };
  } catch (error) {
    return { ok: false as const, error: `Chat Completions API error: ${formatRequestError(error, request.timeoutMs)}` };
  }
}

function createHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = getTimeoutMs()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getTimeoutMs() {
  const configured = Number(process.env.LLM_API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 300000;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractResponsesText(payload: unknown) {
  const record = asRecord(payload);
  const outputText = record.output_text;

  if (typeof outputText === "string") {
    return outputText;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    const content = asRecord(item).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const text = asRecord(contentItem).text;

      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractChatText(payload: unknown) {
  const choices = asRecord(payload).choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const content = asRecord(asRecord(choices[0]).message).content;
  return typeof content === "string" ? content : "";
}

function formatLlmError(source: string, status: number, payload: unknown) {
  const errorPayload = payload as LlmErrorPayload;
  const message = errorPayload.error?.message ?? JSON.stringify(payload);
  const code = errorPayload.error?.code ? ` ${errorPayload.error.code}` : "";
  return `${source}${code} returned ${status}: ${message}`;
}

function formatAttemptName(attempt: LlmAttempt) {
  if (attempt === "chat-json") {
    return "Chat Completions JSON mode";
  }

  if (attempt === "chat") {
    return "Chat Completions";
  }

  return "Responses API";
}

function formatDuration(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatRequestError(error: unknown, timeoutMs = getTimeoutMs()) {
  if (error instanceof Error && error.name === "AbortError") {
    return `timed out after ${formatDuration(timeoutMs)}`;
  }

  return toErrorMessage(error);
}
