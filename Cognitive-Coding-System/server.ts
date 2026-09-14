import express from "express";
import path from "path";
import dotenv from "dotenv";
import { execFileSync, spawn } from "child_process";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { createServer as createViteServer } from "vite";
import { ProxyAgent, type Dispatcher } from "undici";
import {
  SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT,
  SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT_EN,
  SECONDARY_M3_SCREENING_PROMPT_VERSION,
  SECONDARY_M3_SCREENING_PROMPT_VERSION_EN,
  candidateMappingForMessage,
  candidateRecordsToCsv,
  chooseTieCandidate,
  createExperimentRunId,
  createScreeningJsonSchema,
  createSecondaryResponseFormat,
  labelRecordsToCsv,
  parseStrictJsonResponse,
  validateJudgeResult,
  validateSecondaryResults,
  type CandidateAlias,
  type ExperimentMethod,
  type GenerationId
} from "./secondary-experiment-core";

dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const DEFAULT_MODEL_TEMPERATURE = 0.3;
const PROMPT_VERSION = "cognitive-presence-batch-context-v4";
const SECOND_LEVEL_CODES = [
  "T-DP", "T-AQ", "E-UD", "E-RV", "E-BE", "E-BP",
  "I-JA", "I-JD", "I-JHP", "I-JHE", "I-CS", "R-AT"
] as const;

// Body parser
app.use(express.json({ limit: "10mb" }));

function normalizeOpenAIBaseUrl(rawBaseUrl: string): string {
  const parsed = new URL(rawBaseUrl.trim());
  parsed.pathname = parsed.pathname.replace(/\/chat\/completions\/?$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function isOfficialOpenAIBaseUrl(rawBaseUrl: string): boolean {
  try {
    return new URL(rawBaseUrl.trim()).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

function getThirdLevelCodes(courseType: string): string[] {
  if (courseType === "programming_learning") {
    return ["C-SEQ", "C-LOOP", "C-COND", "C-OPER", "C-DATA", "P-ITER", "P-DEBUG", "P-REUSE", "P-ABSMOD", "I-EXPRESS", "I-QUESTION"];
  }
  if (courseType === "discipline_frontier") {
    return ["CH-COG", "CH-MOT", "CH-TIME", "CH-ENV", "CH-SOC", "CH-NONE", "ST-COG", "ST-MOT", "ST-TIME", "ST-ENV", "ST-NONE"];
  }
  return ["EDU-TK", "EDU-PK", "EDU-CK", "EDU-PCK", "EDU-TPK", "EDU-TCK", "EDU-TPACK", "EDU-DK", "EDU-CTX"];
}

function createCodingJsonSchema(
  discussionId: string,
  courseType: string,
  studentMessages: any[]
): any {
  const codingItemSchema = {
    type: "object",
    properties: {
      code: { type: "string", enum: [...SECOND_LEVEL_CODES] },
      evidence: { type: "string" },
      reason: { type: "string" }
    },
    required: ["code", "evidence", "reason"],
    additionalProperties: false
  };
  const level3ItemSchema = {
    type: "object",
    properties: {
      code: { type: "string", enum: getThirdLevelCodes(courseType) },
      name: { type: "string" },
      evidence: { type: "string" },
      reason: { type: "string" }
    },
    required: ["code", "name", "evidence", "reason"],
    additionalProperties: false
  };

  return {
    type: "object",
    properties: {
      discussion_id: { type: "string", enum: [discussionId] },
      course_type: { type: "string", enum: [courseType] },
      coding_results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            message_id: {
              type: "string",
              enum: studentMessages.map(message => message.id)
            },
            author: { type: "string" },
            codes: { type: "array", items: codingItemSchema },
            level_3_codes: { type: "array", items: level3ItemSchema }
          },
          required: ["message_id", "author", "codes", "level_3_codes"],
          additionalProperties: false
        }
      }
    },
    required: ["discussion_id", "course_type", "coding_results"],
    additionalProperties: false
  };
}

function createOpenAIStructuredResponseFormat(
  discussionId: string,
  courseType: string,
  studentMessages: any[]
): any {
  return {
    type: "json_schema",
    json_schema: {
      name: "cscl_cognitive_coding",
      strict: true,
      schema: createCodingJsonSchema(discussionId, courseType, studentMessages)
    }
  };
}

function createAuditedAnalysisResponse(
  validated: any,
  rawModelOutput: any,
  apiProvider: string,
  modelName: string,
  responseFormat: "strict_json_schema" | "json_object" | "json_schema_native"
): any {
  return {
    ...validated,
    api_provider: apiProvider,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    generation_config: {
      temperature: DEFAULT_MODEL_TEMPERATURE,
      temperature_mode: "default",
      response_format: responseFormat,
      analysis_mode: "dynamic_batches_with_context",
      batch_size: CODING_BATCH_SIZE,
      concurrency: CODING_BATCH_CONCURRENCY,
      failed_batch_retry_count: 1,
      missing_message_retry_count: 1
    },
    generated_at: new Date().toISOString(),
    raw_model_output: rawModelOutput
  };
}

class OpenAICompatibleApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenAICompatibleApiError";
    this.status = status;
  }
}

let detectedMacOsProxy: string | null | undefined;
const proxyDispatchers = new Map<string, Dispatcher>();

function detectMacOsHttpsProxy(): string | undefined {
  if (detectedMacOsProxy !== undefined) return detectedMacOsProxy || undefined;
  detectedMacOsProxy = null;
  if (process.platform !== "darwin") return undefined;
  try {
    const output = execFileSync("scutil", ["--proxy"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (!/^\s*HTTPSEnable\s*:\s*1\s*$/m.test(output)) return undefined;
    const host = output.match(/^\s*HTTPSProxy\s*:\s*(\S+)\s*$/m)?.[1];
    const port = output.match(/^\s*HTTPSPort\s*:\s*(\d+)\s*$/m)?.[1];
    if (host && port) detectedMacOsProxy = `http://${host}:${port}`;
  } catch {
    // Direct networking remains the fallback when system proxy discovery fails.
  }
  return detectedMacOsProxy || undefined;
}

function getModelFetchDispatcher(requestUrl: string): Dispatcher | undefined {
  const hostname = new URL(requestUrl).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return undefined;
  const proxyUrl = process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.ALL_PROXY
    || process.env.all_proxy
    || detectMacOsHttpsProxy();
  if (!proxyUrl) return undefined;
  let dispatcher = proxyDispatchers.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
    proxyDispatchers.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

function getStreamDeltaText(data: any): string {
  const delta = data?.choices?.[0]?.delta?.content;
  if (typeof delta === "string") return delta;
  if (!Array.isArray(delta)) return "";
  return delta
    .map((part: any) => typeof part === "string" ? part : (typeof part?.text === "string" ? part.text : ""))
    .join("");
}

async function readOpenAICompatibleSse(
  response: globalThis.Response,
  onActivity: () => void
): Promise<string> {
  if (!response.body) {
    throw new Error("模型返回了流式响应头，但响应正文为空。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  const processEvent = (eventBlock: string) => {
    const dataLines = eventBlock
      .split("\n")
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart());
    if (dataLines.length === 0) return;

    const eventData = dataLines.join("\n").trim();
    if (!eventData || eventData === "[DONE]") return;
    const parsed = JSON.parse(eventData);
    content += getStreamDeltaText(parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity();
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      processEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, "\n");
  if (buffer.trim()) processEvent(buffer);
  if (!content) throw new Error("模型流式响应结束，但没有返回可用内容。");
  return content;
}

async function callOpenAICompatibleEndpoint(params: {
  url: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  responseFormat: any;
  stream: boolean;
  temperature?: number;
  extraParams?: Record<string, unknown>;
}): Promise<string> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const resetIdleTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), 300_000);
  };
  resetIdleTimeout();

  try {
    const dispatcher = getModelFetchDispatcher(params.url);
    const response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${params.apiKey}`
      },
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        response_format: params.responseFormat,
        stream: params.stream,
        ...(typeof params.temperature === "number" ? { temperature: params.temperature } : {}),
        ...(params.extraParams || {})
      })
    } as RequestInit & { dispatcher?: Dispatcher });
    resetIdleTimeout();

    if (!response.ok) {
      const responseText = await response.text();
      const schemaCompatibilityHint = [400, 422].includes(response.status)
        && /response[_-]?format|json[_-]?schema|schema/i.test(responseText)
        ? " 该厂商或当前模型可能不支持请求中的 JSON response_format。"
        : "";
      throw new OpenAICompatibleApiError(
        response.status,
        `OpenAI-compatible API returned status ${response.status}: ${responseText}${schemaCompatibilityHint}`
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (params.stream && contentType.includes("text/event-stream")) {
      return await readOpenAICompatibleSse(response, resetIdleTimeout);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenAI-compatible LLM returned empty content.");
    }
    return content;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("大模型流式请求连续 300 秒未收到新内容，已停止等待。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOfficialOpenAIEndpoint(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  responseFormat: any;
  temperature?: number;
}): Promise<string> {
  const pythonBin = process.env.OPENAI_PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const bridgePath = path.join(process.cwd(), "scripts", "openai_bridge.py");

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(pythonBin, [bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const finish = (error?: Error, content?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(content || "");
    };

    const resetIdleTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(new Error("OpenAI 流式请求连续 300 秒未收到新内容，已停止等待。"));
      }, 300_000);
    };
    resetIdleTimeout();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      resetIdleTimeout();
      stdout += chunk;
      if (stdout.length > 5_000_000) {
        child.kill("SIGTERM");
        finish(new Error("OpenAI 返回内容超过系统允许的大小。"));
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 100_000) {
        stderr = stderr.slice(-100_000);
      }
    });

    child.on("error", (error) => {
      finish(new Error(`无法启动 OpenAI Python 调用器：${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        let message = stderr.trim() || `OpenAI Python 调用器退出码：${code}`;
        try {
          const parsedError = JSON.parse(stderr);
          message = parsedError.error || message;
        } catch {
          // Keep the bounded stderr text when it is not JSON.
        }
        finish(new Error(message));
        return;
      }

      try {
        const resultMarker = "\n__OPENAI_STREAM_RESULT__";
        const markerIndex = stdout.indexOf(resultMarker);
        const resultText = markerIndex >= 0
          ? stdout.slice(markerIndex + resultMarker.length)
          : stdout;
        const result = JSON.parse(resultText);
        if (!result?.content || typeof result.content !== "string") {
          throw new Error("OpenAI 返回内容为空。");
        }
        finish(undefined, result.content);
      } catch (error: any) {
        finish(new Error(`无法解析 OpenAI Python 调用结果：${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify({
      api_key: params.apiKey,
      base_url: normalizeOpenAIBaseUrl(params.baseUrl),
      model: params.model,
      messages: params.messages,
      response_format: params.responseFormat,
      temperature: params.temperature,
    }));
  });
}

const CODING_BATCH_SIZE = Math.min(
  20,
  Math.max(1, Number.parseInt(process.env.LLM_CODING_BATCH_SIZE || "10", 10) || 10)
);
const CODING_BATCH_CONCURRENCY = Math.min(
  4,
  Math.max(1, Number.parseInt(process.env.LLM_CODING_CONCURRENCY || "2", 10) || 2)
);

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function runCodingBatchPlan<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  // Use the first batch as a provider/configuration probe. Authentication or
  // endpoint errors therefore fail before a full wave of requests is started.
  const first = await worker(items[0], 0);
  const remaining = await mapWithConcurrency(
    items.slice(1),
    CODING_BATCH_CONCURRENCY,
    (item, index) => worker(item, index + 1)
  );
  return [first, ...remaining];
}

function shouldRetryCodingError(error: any): boolean {
  if (error instanceof OpenAICompatibleApiError) {
    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  const message = String(error?.message || error || "");
  if (/状态\s*4\d\d|status\s*4\d\d/i.test(message) && !/408|409|429/.test(message)) return false;
  return true;
}

async function withCodingRetry<T>(label: string, worker: () => Promise<T>): Promise<T> {
  try {
    return await worker();
  } catch (firstError: any) {
    if (!shouldRetryCodingError(firstError)) throw firstError;
    console.warn(`Coding analysis ${label} failed once; retrying: ${firstError.message}`);
    try {
      return await worker();
    } catch (secondError: any) {
      throw new Error(`${label} 分析重试后仍失败：${secondError.message}`);
    }
  }
}

function getRelevantMessageContext(messages: any[], targetMessage: any): any[] {
  const targetIndex = messages.findIndex(message => message.id === targetMessage.id);
  const messageById = new Map(messages.map(message => [message.id, message]));
  const selectedIds = new Set<string>();

  // Preserve the reply chain because agreement, disagreement, paraphrase and
  // solution-validation codes depend on what the student is responding to.
  let parentId = targetMessage.parent_id;
  for (let depth = 0; depth < 3 && parentId; depth += 1) {
    const parent = messageById.get(parentId);
    if (!parent) break;
    selectedIds.add(parent.id);
    parentId = parent.parent_id;
  }

  // Add a small local window for turn-taking context without resending the
  // complete discussion for every model call.
  if (targetIndex >= 0) {
    for (let index = Math.max(0, targetIndex - 2); index <= Math.min(messages.length - 1, targetIndex + 1); index += 1) {
      if (messages[index].id !== targetMessage.id) selectedIds.add(messages[index].id);
    }
  }

  return messages.filter(message => selectedIds.has(message.id));
}

function chunkMessages(messages: any[], batchSize: number): any[][] {
  const batches: any[][] = [];
  for (let index = 0; index < messages.length; index += batchSize) {
    batches.push(messages.slice(index, index + batchSize));
  }
  return batches;
}

function getBatchMessageContext(messages: any[], targetMessages: any[]): any[] {
  const targetIds = new Set(targetMessages.map(message => message.id));
  const contextIds = new Set<string>();
  for (const targetMessage of targetMessages) {
    for (const contextMessage of getRelevantMessageContext(messages, targetMessage)) {
      if (!targetIds.has(contextMessage.id)) contextIds.add(contextMessage.id);
    }
  }
  return messages.filter(message => contextIds.has(message.id));
}

function getMissingTargetMessages(targetMessages: any[], parsed: any): any[] {
  const returnedIds = new Set<string>(
    Array.isArray(parsed?.coding_results)
      ? parsed.coding_results
          .map((item: any) => typeof item?.message_id === "string" ? item.message_id : "")
          .filter(Boolean)
      : []
  );
  return targetMessages.filter(message => !returnedIds.has(message.id));
}

async function analyzeBatchWithMissingRecovery(params: {
  discussionId: string;
  courseType: string;
  targetMessages: any[];
  callModel: (targetMessages: any[]) => Promise<any>;
}): Promise<{ raw: any[]; validated: any }> {
  const label = `批次 ${params.targetMessages[0].id}–${params.targetMessages.at(-1).id}`;
  const initial = await withCodingRetry(label, () => params.callModel(params.targetMessages));
  const rawOutputs = [initial];
  const missingMessages = getMissingTargetMessages(params.targetMessages, initial);
  if (missingMessages.length > 0) {
    console.warn(`${label} omitted ${missingMessages.map(message => message.id).join(", ")}; retrying those messages individually.`);
    const recovered = await mapWithConcurrency(
      missingMessages,
      CODING_BATCH_CONCURRENCY,
      targetMessage => withCodingRetry(
        `缺失消息 ${targetMessage.id}`,
        () => params.callModel([targetMessage])
      )
    );
    rawOutputs.push(...recovered);
  }

  const combined = {
    discussion_id: params.discussionId,
    course_type: params.courseType,
    coding_results: rawOutputs.flatMap(output => Array.isArray(output?.coding_results) ? output.coding_results : [])
  };
  const stillMissing = getMissingTargetMessages(params.targetMessages, combined);
  if (stillMissing.length > 0) {
    throw new ModelResponseValidationError(
      `补调后仍缺少消息：${stillMissing.map(message => message.id).join("、")}`
    );
  }

  return {
    raw: rawOutputs,
    validated: validateAndNormalizeResults(
      params.discussionId,
      params.targetMessages,
      combined,
      params.courseType
    )
  };
}

function mergeBatchAnalyses(
  discussionId: string,
  courseType: string,
  studentMessages: any[],
  analyses: any[]
): any {
  const codingById = new Map<string, any>();
  const validationIssues: string[] = [];

  for (const analysis of analyses) {
    for (const item of analysis.coding_results || []) codingById.set(item.message_id, item);
    if (Array.isArray(analysis.validation_issues)) validationIssues.push(...analysis.validation_issues);
  }

  const missingIds = studentMessages
    .filter(message => !codingById.has(message.id))
    .map(message => message.id);
  if (missingIds.length > 0) {
    throw new ModelResponseValidationError(`批次调用汇总时缺少消息：${missingIds.join("、")}`);
  }

  const result: any = {
    discussion_id: discussionId,
    course_type: courseType,
    coding_results: studentMessages.map(message => codingById.get(message.id)),
    validation_issues: validationIssues
  };
  if (validationIssues.length > 0) {
    const preview = validationIssues.slice(0, 5).join("；");
    const remaining = validationIssues.length > 5 ? `；另有 ${validationIssues.length - 5} 项` : "";
    result.warning = `模型返回中有 ${validationIssues.length} 项校验或规范化提示。${preview}${remaining}。`;
  }
  return result;
}

const SECOND_LEVEL_CODING_PROMPT = `
【二级认知存在编码：依据 Cognitive Presence 原始编码表的中文操作化规范】

编码单位与证据原则：
- 以每一条学生消息为独立编码单位；上下文仅用于理解指代、回应对象和讨论进程，不能把其他人的观点算到当前学生名下。
- 根据完整语义和论证功能判断，不得仅凭“问题、觉得、同意、因为、文献、测试”等关键词机械匹配。
- 不要求每条消息必须命中编码。没有充分证据时返回空数组，宁缺毋滥。
- 每个编码都必须绑定当前消息中可逐字找到的最小完整连续证据片段，不得改写、拼接或概括证据。
- 一个认知行为只编码一次；同一消息确有多个可分离的认知行为时可以多标签，但每个编码必须有各自对应的证据。

以下“来源定义”均为用户提供的 Cognitive Presence 编码表之中文翻译；必要条件及例子用于将来源定义操作化。例子只帮助理解，不得按共享关键词直接匹配。

1. 触发事件 Triggering
- T-DP（描述问题）
  来源定义：识别并描述一个问题，并提供与该问题有关的背景信息。
  必要条件：原文明示具体问题或问题背景。
  正例：“我们目前收集到的数据不完整，无法支持后续分析。”
  反例：“我们应该怎样补充数据？”——主要功能是提问，不是描述问题。
- T-AQ（提出问题）
  来源定义：通过提出问题表达困惑或疑惑感。
  必要条件：原文明确提出需要回答或探究的问题。
  正例：“我们应该如何分工，才能在截止时间前完成资料整理和汇报？”
  反例：“现在的任务分工不清楚。”——只描述问题，没有提出问题。

2. 探索 Exploration
- E-UD（无依据的反对或批评）
  来源定义：对先前观点作出没有依据的反驳或批评。
  必要条件：明确反对、否定或批评先前观点，但没有提供支持理由。
  正例：“我不同意这个方案，我觉得这样不行。”
  反例：“我不同意现在制作PPT，因为资料还没有核实。”——反对意见有明确依据。
- E-RV（复述或换述）
  来源定义：重复或换一种说法表述先前观点，但不增加新观点。
  必要条件：内容实质上只是重复、确认或改述已有观点。
  正例：“我也同意学生02刚才说的，我们需要先整理资料。”
  反例：“我同意先整理资料，因为这样能避免后面重复核对。”——增加了论证理由。
- E-BE（基于外部资源进行观点头脑风暴）
  来源定义：依据外部资源交换信息或观点，例如观察或过去经验、阅读材料、互联网、教师或其他专家；但不把这些资源作为支持结论的证据。
  必要条件：明确引入上述外部信息来源，用于探索或扩展观点。
  正例：“我查阅了一篇研究，文中提到同伴互评可以提高小组学习投入。”
  反例：“研究表明角色分工能减少搭便车，因此我们应该明确资料员和汇报员。”——外部资源被用于支持结论。
- E-BP（基于个人信念或偏好进行观点头脑风暴）
  来源定义：依据个人信念或偏好交换观点或意见；可以在既有观点上补充，但没有系统地为补充内容辩护、论证或深入发展；也可能在一条消息中提出多个不同观点或主题，或给出没有支持的意见。
  必要条件：观点主要建立在个人信念、偏好或主观判断上，且没有形成系统论证。
  正例：“我个人更喜欢先做展示稿，这样安排感觉比较顺手。”
  反例：“根据以往小组经验，每天同步能及时发现进度差异，因此我们可以设置每日同步。”——个人经验被用于发展和论证假设。

3. 整合 Integration
- I-JA（论证性同意或补充）
  来源定义：引用先前消息并在其后作出有依据的同意，例如“我同意……因为……”；在他人观点上继续建构或增加内容，并对新增内容进行论证。
  必要条件：回应先前观点，同时提供支持理由或经过论证的实质性补充。
  正例：“我同意学生02先分工的建议，因为按成员专长分配任务可以减少重复劳动；我补充由一人统一校对。”
  反例：“我也同意先分工。”——没有依据或实质性补充。
- I-JD（论证性反对或批评）
  来源定义：对先前观点作出有依据的反驳或批评。
  必要条件：明确反对或批评先前观点，并提供直接相关的理由、证据或推导。
  正例：“我不同意现在直接制作PPT，因为核心资料还没有核实，先制作会导致后续反复返工。”
  反例：“这个方案不行。”——没有给出反对依据。
- I-JHP（基于个人信念或偏好论证假设）
  来源定义：基于个人信念或偏好，发展并论证一个可辩护但仍属暂定的假设。
  必要条件：提出暂定假设，并使用个人信念或偏好对其进行发展和论证。
  正例：“根据我以往的小组经验，每天同步可能及时发现进度差异，因此我们可以设置每日同步。”
  反例：“我觉得每天同步比较好。”——只有个人意见，没有发展和论证假设。
- I-JHE（基于外部资源论证假设）
  来源定义：基于外部资源发展并论证一个可辩护但仍属暂定的假设；外部资源包括观察或过去经验、阅读材料、互联网、教师或其他专家。
  必要条件：提出暂定假设，并以明确的外部资源对其进行发展和论证。
  正例：“研究表明结构化角色分工能够减少搭便车，因此我们可以明确记录员、汇报员和资料员。”
  反例：“我看到一篇研究介绍了结构化角色分工。”——只引入外部信息。
- I-CS（创建解决方案）
  来源定义：针对已经识别的问题，创建并论证一个解决方案。
  必要条件：方案对应一个已识别的问题，并说明方案为何能够解决该问题。
  正例：“资料容易重复，所以我们按成员专长分工并由一人统一校对，这样既能减少重复劳动，也能保证格式一致。”
  反例：“我们可以先分工试试。”——提出了建议，但没有论证其如何解决问题。

4. 解决 Resolution
- R-AT（检验或辩护解决方案）
  来源定义：把解决方案应用于真实情境，并使用获得的经验检验或辩护该解决方案。
  必要条件：原文表明方案已经在真实情境中应用，并用实际结果或经验评价、检验或辩护方案。
  正例：“我们按新分工实际运行了两天，任务延误明显减少，这说明该方案能够改善进度问题。”
  反例：“我们可以按新分工试运行两天看看效果。”——只是未来测试计划，尚未真实应用并获得经验。
`;

const SECOND_LEVEL_CODING_PROMPT_EN = `
[Second-level Cognitive Presence Coding Codebook]

Use the following Codebook as the sole basis for coding. A message may receive zero, one, or multiple labels. Labels must be supported by the current student's message; context may clarify references but may not replace evidence from the current message.

1. Triggering Event
- T-DP (Describe problems)
  Definition: Recognize and describe a problem, and present background information on the problem.
- T-AQ (Ask questions)
  Definition: Express a sense of puzzlement by asking questions.

2. Exploration
- E-UD (Unsubstantiated disagreement/critique)
  Definition: Give unsubstantiated contradiction or critique of previous ideas.
- E-RV (Re-voice)
  Definition: Repeat or rephrase previous ideas, but add no new ideas.
- E-BE (Brainstorm ideas based on external resources)
  Definition: Exchange information or ideas based on external resources such as observations or past experience, readings, the internet, teachers, or other experts, without using those resources as evidence to support a conclusion.
- E-BP (Brainstorm ideas based on personal beliefs or preferences)
  Definition: Exchange ideas or opinions based on personal beliefs or preferences; add to established points without systematically defending, justifying, or developing the addition; present multiple ideas or themes in one message; or offer unsupported opinions.

3. Integration
- I-JA (Justify agreement/addition)
  Definition: Refer to a previous message and provide substantiated agreement (for example, “I agree ... because ...”), or build on and add to others' ideas while justifying the addition.
- I-JD (Justify disagreement/critique)
  Definition: Give justified contradiction or critique of previous ideas.
- I-JHP (Justify hypothesis based on personal beliefs or preferences)
  Definition: Develop and justify a defensible, yet tentative hypothesis based on personal beliefs or preferences.
- I-JHE (Justify hypothesis based on external resources)
  Definition: Develop and justify a defensible, yet tentative hypothesis based on external resources such as observations or past experience, readings, the internet, teachers, or other experts.
- I-CS (Create solutions)
  Definition: Create and justify a solution to the identified problem.

4. Resolution
- R-AT (Test/Defend solutions)
  Definition: Apply the solution in the real world and use the experience to test or defend the solution.
`;

const SECONDARY_M3_GENERATION_PROMPT_VERSION_EN = "secondary-m3-generation-en-v1";
const SECONDARY_M3_GENERATION_PROMPT_VERSION_ZH = "secondary-m3-generation-zh-v1";

const IT_PEDAGOGY_THIRD_LEVEL_PROMPT = `
【课程三级认知存在 Codebook：信息技术教学法】
请在确定二级编码后，根据发言内容及上下文，匹配以下三级编码（可匹配一个、多个，或不匹配）。如果确定有符合的认知存在表现，但无明确的三级表现，则三级编码输出空数组 []。

代码与指标定义：
- EDU-TK (技术知识)：学生讨论数字工具、软件、平台、硬件的功能、操作方式、技术特征或限制，但没有说明该技术如何支持具体教学方法或具体学科内容。
- EDU-PK (教学法知识)：学生讨论一般教学策略、教学组织、课堂管理或评价方式，但没有联系具体学科内容，也没有讨论ICT工具。
- EDU-CK (学科内容知识)：学生讨论信息技术课程或拟教学学科中的概念、原理、事实、程序和知识关系，但没有讨论如何教授或如何使用ICT呈现这些内容。
- EDU-PCK (学科教学知识)：学生讨论如何采用特定教学方法帮助学生理解某项具体学科内容，但不涉及ICT工具。
- EDU-TPK (技术教学法知识)：学生讨论ICT工具如何支持某种教学策略、学习活动、课堂组织或评价方式，但没有明确联系某项具体学科内容。
- EDU-TCK (技术学科内容知识)：学生讨论ICT工具如何表达、呈现、处理或模拟具体学科内容，但没有进一步形成完整教学策略。
- EDU-TPACK (整合性技术教学内容知识)：学生综合讨论ICT工具、教学方法和具体学科内容，说明如何使用适当技术支持特定教学策略，以促进学生理解明确的学科知识。
- EDU-DK (设计知识)：学生讨论教学设计过程，包括目标确定、需求分析、资源选择、教学步骤安排、评价设计、方案比较和根据反馈修改教学方案。
- EDU-CTX (学校教学情境)：学生讨论可能影响教学实施的现实学校因素，包括设备、网络、课时、班级规模、学校制度、经费、数据隐私和技术支持等。
TK、PK、CK、PCK、TPK、TCK和TPACK采用“最具体编码优先”原则：
技术＋教学方法＋具体内容 → EDU-TPACK
技术＋具体内容 → EDU-TCK
技术＋教学方法 → EDU-TPK
教学方法＋具体内容且无ICT → EDU-PCK
只有技术 → EDU-TK
只有教学方法 → EDU-PK
只有具体内容 → EDU-CK
如果已经编码为EDU-TPACK，不要再重复输出EDU-TK、EDU-PK、EDU-CK、EDU-TPK、EDU-TCK或EDU-PCK。
EDU-DK和EDU-CTX可以作为附加三级编码，与上述一个主要编码同时出现。
只出现工具、教学方法或知识点名称，没有实质讨论时，不进行三级编码。
`;

const PROGRAMMING_LEARNING_THIRD_LEVEL_PROMPT = `
【课程三级认知存在 Codebook：编程学习】
请在确定二级编码后，根据发言内容及上下文，匹配以下三级编码（可匹配一个、多个，或不匹配）。如果确定有符合的认知存在表现，但无明确的三级表现，则三级编码输出空数组 []。

代码与指标定义：
- C-SEQ (顺序结构)：学生讨论能够由计算机依次执行的一系列步骤、语句或指令，包括程序执行顺序、语句先后关系和算法步骤。
- C-LOOP (循环结构)：学生讨论让相同或相似指令重复执行的程序机制，包括循环次数、循环条件、嵌套循环和循环终止。
- C-COND (条件结构)：学生讨论程序如何根据条件作出判断并产生不同执行路径或结果，包括条件表达式、分支选择和边界条件。
- C-OPER (运算操作)：学生讨论数学、逻辑或字符串运算，以及这些运算如何支持数据处理、条件判断和程序结果计算。
- C-DATA (数据)：学生讨论数据类型以及数据的定义、存储、读取、传递、修改 and 更新，包括变量、数组、列表、参数和作用域。
- P-ITER (增量与迭代)：学生将复杂编程任务分解为较小的子任务或阶段，通过设计、实现、检查和修改的循环逐步完善程序。
- P-DEBUG (测试与调试)：学生针对程序错误、异常结果或未达到预期的运行现象，进行问题定位、原因分析、测试验证、代码修改和结果复查。
- P-REUSE (复用与重混)：学生寻找、理解并使用已有代码、案例、算法或他人方案，在其基础上进行修改、组合和扩展。
- P-ABSMOD (抽象与模块化)：学生从具体问题或代码中识别共同模式、概括一般规律，或者将复杂程序分解为功能相对独立的函数、类和模块。
- I-EXPRESS (计算表达)：学生将编程视为创造作品、表达想法和解决真实问题的手段，而不只是记忆语法、模仿代码或被动使用软件。
- I-QUESTION (计算质疑)：学生分析或质疑程序、算法、AI工具及计算技术的功能、可靠性、局限和现实影响，并形成对技术能力边界的认识。
`;

const DISCIPLINE_FRONTIER_THIRD_LEVEL_PROMPT = `
【课程三级认知存在 Codebook：学科前沿展示】
请在确定二级编码后，根据发言内容及上下文，匹配以下三级编码（可匹配一个、多个，或不匹配）。如果确定有符合的认知存在表现，但无明确的三级表现，则三级编码输出空数组 []。

代码与指标定义：
- CH-COG (认知挑战)：小组在理解任务要求、掌握相关概念、理解复杂知识、整合不同信息或形成共同认识等方面遇到的困难。
- CH-MOT (动机挑战)：小组成员在保持学习兴趣、任务投入、参与积极性、信心或持续完成任务的意愿等方面遇到的困难。
- CH-TIME (时间管理挑战)：小组在时间不足、进度安排、成员时间协调、任务期限或工作量分配等方面遇到的困难。
- CH-ENV (环境与技术挑战)：小组在使用软件、设备、网络、学习平台或其他技术工具，以及适应新的学习环境和学习方式时遇到的困难。
- CH-SOC (社会互动挑战)：小组成员在沟通交流、理解彼此观点、协调意见、角色分工、成员配合或处理人际关系等方面遇到的困难。
- CH-NONE (未识别到挑战)：仅当学生明确表示没有遇到挑战，或在直接回答“遇到什么挑战”时明确否认存在具体困难。不能仅因文本未讨论挑战就使用该编码。
- ST-COG (认知调节策略)：小组通过学习相关知识、查找并分析资料、分享知识、解释观点、讨论问题、整合信息或调整解决思路来克服困难。
- ST-MOT (动机调节策略)：小组通过相互鼓励、增强信心、维持兴趣、激发积极性或营造积极的团队氛围来保持任务投入。
- ST-TIME (时间管理策略)：小组通过制定计划、安排时间、设置任务期限、划分任务阶段或协调成员进度来推动任务按时完成。
- ST-ENV (环境建构策略)：小组通过选择或调整学习环境、使用技术工具、利用平台功能、寻找外部资源或改善任务条件来支持任务完成。
- ST-NONE (未提出有效策略)：仅当学生明确表示没有应对办法，或在直接回答“采取了什么策略”时只表达“努力完成”“认真对待”等态度而没有任何可执行行动。不能仅因文本未讨论策略就使用该编码。

挑战与策略采用两组独立但组内互斥的编码：
- CH-NONE 与 CH-COG、CH-MOT、CH-TIME、CH-ENV、CH-SOC 互斥。只要同一消息识别出任一具体 CH-* 挑战，就绝对不能再输出 CH-NONE。
- ST-NONE 与 ST-COG、ST-MOT、ST-TIME、ST-ENV 互斥。只要同一消息识别出任一具体 ST-* 策略，就绝对不能再输出 ST-NONE。
- “未提及某类内容”不等于“明确不存在”。一条消息只讨论挑战时，策略编码可以为空；只讨论策略时，挑战编码也可以为空，不要自动补 NONE。
`;

const IT_PEDAGOGY_THIRD_LEVEL_PROMPT_EN = `
[Course-specific Third-level Codebook: Information Technology Pedagogy]
After assigning second-level codes, use the message and its context to assign zero, one, or multiple third-level codes. Return an empty array [] when no third-level code is clearly supported.

- EDU-TK (Technological Knowledge): Functions, operation, features, or limitations of digital tools, software, platforms, or hardware, without explaining how the technology supports a specific pedagogy or subject matter.
- EDU-PK (Pedagogical Knowledge): General teaching strategies, classroom organization, classroom management, or assessment, without specific subject matter or ICT tools.
- EDU-CK (Content Knowledge): Concepts, principles, facts, procedures, or knowledge relations in the subject being taught, without discussing how to teach or represent them with ICT.
- EDU-PCK (Pedagogical Content Knowledge): How a particular pedagogy helps learners understand specific subject matter, without ICT tools.
- EDU-TPK (Technological Pedagogical Knowledge): How ICT supports a teaching strategy, learning activity, classroom organization, or assessment, without specific subject matter.
- EDU-TCK (Technological Content Knowledge): How ICT represents, processes, or simulates specific subject matter, without a complete teaching strategy.
- EDU-TPACK (Technological Pedagogical Content Knowledge): An integrated account of technology, pedagogy, and specific subject matter that explains how suitable technology supports a teaching strategy to promote understanding.
- EDU-DK (Design Knowledge): Instructional design processes such as setting objectives, analysing needs, choosing resources, sequencing instruction, designing assessment, comparing alternatives, or revising a design from feedback.
- EDU-CTX (School Context): Real school factors that affect implementation, including equipment, networks, class time, class size, institutional rules, funding, data privacy, or technical support.

For TK, PK, CK, PCK, TPK, TCK, and TPACK, prefer the most specific code. If EDU-TPACK applies, do not also output its less specific component codes. EDU-DK and EDU-CTX may accompany one principal code. Do not code a mere mention of a tool, pedagogy, or knowledge topic without substantive discussion.
`;

const PROGRAMMING_LEARNING_THIRD_LEVEL_PROMPT_EN = `
[Course-specific Third-level Codebook: Programming Learning]
After assigning second-level codes, use the message and its context to assign zero, one, or multiple third-level codes. Return an empty array [] when no third-level code is clearly supported.

- C-SEQ (Sequences): Ordered steps, statements, instructions, execution order, or algorithmic steps.
- C-LOOP (Loops): Repetition mechanisms, iteration counts or conditions, nested loops, or termination.
- C-COND (Conditionals): Conditions, decisions, branches, alternative execution paths, or boundary cases.
- C-OPER (Operators): Mathematical, logical, or string operations used in data processing, decisions, or result calculation.
- C-DATA (Data): Data types and the definition, storage, reading, transfer, modification, or updating of variables, arrays, lists, parameters, or scope.
- P-ITER (Incremental and Iterative Development): Decomposing a complex task and progressively improving a program through cycles of design, implementation, checking, and revision.
- P-DEBUG (Testing and Debugging): Locating, explaining, testing, fixing, and rechecking program errors, abnormal output, or unmet expectations.
- P-REUSE (Reusing and Remixing): Finding, understanding, adapting, combining, or extending existing code, examples, algorithms, or others' solutions.
- P-ABSMOD (Abstraction and Modularization): Identifying common patterns or general rules, or decomposing a complex program into functions, classes, or modules.
- I-EXPRESS (Computational Expression): Treating programming as a means to create, express ideas, or solve authentic problems rather than merely memorizing syntax or copying code.
- I-QUESTION (Computational Questioning): Analysing or questioning the function, reliability, limits, or real-world effects of programs, algorithms, AI tools, or computing technologies.
`;

const DISCIPLINE_FRONTIER_THIRD_LEVEL_PROMPT_EN = `
[Course-specific Third-level Codebook: Disciplinary Frontier Presentation]
After assigning second-level codes, use the message and its context to assign zero, one, or multiple third-level codes. Return an empty array [] when no third-level code is clearly supported.

- CH-COG (Cognitive Challenge): Difficulty understanding requirements or concepts, integrating information, or building shared understanding.
- CH-MOT (Motivational Challenge): Difficulty sustaining interest, engagement, confidence, participation, or willingness to continue.
- CH-TIME (Time-management Challenge): Insufficient time, scheduling, deadline, workload, or progress-coordination difficulty.
- CH-ENV (Environmental and Technical Challenge): Difficulty with software, devices, networks, platforms, technologies, or a new learning environment.
- CH-SOC (Social-interaction Challenge): Difficulty communicating, understanding perspectives, coordinating opinions or roles, collaborating, or managing relationships.
- CH-NONE (No Identified Challenge): Use only when the student explicitly states that no challenge occurred, or explicitly denies a challenge when directly asked.
- ST-COG (Cognitive Regulation Strategy): Learning, finding and analysing information, sharing knowledge, explaining ideas, discussing problems, integrating information, or revising an approach.
- ST-MOT (Motivational Regulation Strategy): Encouraging one another, strengthening confidence, maintaining interest, increasing motivation, or creating a positive team climate.
- ST-TIME (Time-management Strategy): Planning, scheduling, setting deadlines, dividing stages, or coordinating progress.
- ST-ENV (Environmental Construction Strategy): Selecting or changing the environment, using tools or platform features, obtaining external resources, or improving task conditions.
- ST-NONE (No Effective Strategy): Use only when the student explicitly says there was no response strategy, or gives only a vague attitude such as “work hard” when directly asked about strategies.

CH-NONE is mutually exclusive with all specific CH-* codes; ST-NONE is mutually exclusive with all specific ST-* codes. Absence of a mention is not evidence of nonexistence. A message may discuss only challenges or only strategies without receiving a NONE code for the other group.
`;

type ExperimentModelConfigInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
};

type ResolvedExperimentModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  provider: "openai" | "openai_compatible";
};

const SECONDARY_EXPERIMENT_DIR = process.env.SECONDARY_EXPERIMENT_DIR
  ? path.resolve(process.env.SECONDARY_EXPERIMENT_DIR)
  : path.join(process.cwd(), "data", "secondary-experiments");

function resolveExperimentModelConfig(
  input: ExperimentModelConfigInput | undefined,
  options: { requireExplicit: boolean; role: "生成" | "筛选" }
): ResolvedExperimentModelConfig {
  const userApiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
  const userBaseUrl = typeof input?.baseUrl === "string" ? input.baseUrl.trim() : "";
  const userModel = typeof input?.model === "string" ? input.model.trim() : "";
  const temperature = input?.temperature ?? DEFAULT_MODEL_TEMPERATURE;
  if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error(`${options.role}模型 temperature 必须是 0 到 2 之间的数字。`);
  }
  if (options.requireExplicit && (!userApiKey || !userBaseUrl || !userModel)) {
    throw new Error(`M3 必须单独完整配置${options.role}模型的 API Key、Base URL 和模型名称。`);
  }

  const envApiKey = process.env.LLM_API_KEY?.trim() || "";
  const envBaseUrl = process.env.LLM_BASE_URL?.trim() || "";
  const envModel = process.env.LLM_MODEL?.trim() || "";
  const apiKey = userApiKey || envApiKey;
  if (!apiKey) throw new Error(`${options.role}模型缺少 API Key。`);
  const baseUrl = userBaseUrl || envBaseUrl || "https://api.openai.com/v1";
  return {
    apiKey,
    baseUrl,
    model: userModel || envModel || "gpt-4o-mini",
    temperature,
    provider: isOfficialOpenAIBaseUrl(baseUrl) ? "openai" : "openai_compatible"
  };
}

function publicModelConfig(config: ResolvedExperimentModelConfig): Record<string, unknown> {
  return {
    base_url: config.baseUrl,
    model: config.model,
    temperature: config.temperature ?? null,
    provider: config.provider
  };
}

function redactSecrets(value: unknown, secrets: Array<string | undefined>): string {
  let text = String(value ?? "");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

function createJsonSchemaResponseFormat(name: string, schema: any): any {
  return { type: "json_schema", json_schema: { name, strict: true, schema } };
}

async function callExperimentJsonModel(params: {
  config: ResolvedExperimentModelConfig;
  messages: Array<{ role: string; content: string }>;
  responseFormat: any;
  temperature?: number;
  callId?: string;
  requestedAt?: string;
}): Promise<{ call_id: string; requested_at: string; completed_at: string; raw_text: string; parsed: any; normalizations: string[] }> {
  const callId = params.callId || randomUUID();
  const requestedAt = params.requestedAt || new Date().toISOString();
  let rawText = "";
  if (params.config.provider === "openai") {
    rawText = await callOfficialOpenAIEndpoint({
      apiKey: params.config.apiKey,
      baseUrl: params.config.baseUrl,
      model: params.config.model,
      messages: params.messages,
      responseFormat: params.responseFormat,
      temperature: params.temperature
    });
  } else {
    const url = params.config.baseUrl.endsWith("/chat/completions")
      ? params.config.baseUrl
      : `${params.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    try {
      rawText = await callOpenAICompatibleEndpoint({
        url,
        apiKey: params.config.apiKey,
        model: params.config.model,
        messages: params.messages,
        responseFormat: { type: "json_object" },
        stream: true,
        temperature: params.temperature
      });
    } catch (error: any) {
      const rejectsStreaming = error instanceof OpenAICompatibleApiError
        && [400, 422].includes(error.status)
        && /stream|streaming|sse|流式/i.test(error.message);
      if (!rejectsStreaming) throw error;
      rawText = await callOpenAICompatibleEndpoint({
        url,
        apiKey: params.config.apiKey,
        model: params.config.model,
        messages: params.messages,
        responseFormat: { type: "json_object" },
        stream: false,
        temperature: params.temperature
      });
    }
  }
  if (!rawText) throw new Error("模型返回内容为空。");
  let parsed: any;
  let normalizations: string[] = [];
  try {
    const parseResult = parseModelJsonWithMetadata(rawText);
    parsed = parseResult.parsed;
    normalizations = parseResult.normalizations;
  } catch (error: any) {
    error.rawModelText = rawText;
    error.completedAt = new Date().toISOString();
    throw error;
  }
  return {
    call_id: callId,
    requested_at: requestedAt,
    completed_at: new Date().toISOString(),
    raw_text: rawText,
    parsed,
    normalizations
  };
}

async function callExperimentWithRetry(params: Parameters<typeof callExperimentJsonModel>[0]): Promise<{
  result: Awaited<ReturnType<typeof callExperimentJsonModel>>;
  attempts: any[];
}> {
  const attempts: any[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const callId = randomUUID();
    const requestedAt = new Date().toISOString();
    try {
      const result = await callExperimentJsonModel({ ...params, callId, requestedAt });
      attempts.push({ ...result, parsed: undefined, raw_text: result.raw_text });
      return { result, attempts };
    } catch (error: any) {
      attempts.push({
        call_id: callId,
        requested_at: requestedAt,
        attempt,
        failed_at: error?.completedAt || new Date().toISOString(),
        error: redactSecrets(error?.message || error, [params.config.apiKey]),
        ...(typeof error?.rawModelText === "string" ? { raw_text: error.rawModelText } : {})
      });
      if (attempt === 2 || !shouldRetryCodingError(error)) {
        error.callAttempts = attempts;
        throw error;
      }
    }
  }
  throw new Error("模型调用失败。");
}

function secondarySystemInstruction(prompt: string, language: "zh" | "en" = "zh"): string {
  if (language === "en") {
    return `You are a rigorous graduate-level academic assistant and an expert in CSCL (computer-supported collaborative learning) cognitive-presence coding.
Your task is to assign second-level, multi-label cognitive-presence codes to every explicitly marked current-batch student message. Do not perform any third-level coding.

${prompt}

[Unified coding and response rules]
- Code only current-batch messages whose author_role is “Student”. Teacher and Robot messages are context only.
- Each message may receive zero, one, or multiple second-level codes. Return each code at most once per message. If several passages support the same code, preserve all distinct evidence-reason pairs in evidence_items; do not duplicate the code object.
- For every code, return code, verbatim evidence from the current message, an English reason, and evidence_items containing every retained evidence-reason pair.
- Return exactly one record for every requested message_id. If no code applies, return codes: [].
- level_3_codes must always be an empty array [].
- Return strict JSON only, with no Markdown or extra text.`;
  }
  return `你是一位严谨的研究生院级别学术助教和CSCL（计算机支持的协作学习）认知编码专家。
你的任务是对明确标记的“当前批次学生发言”逐条进行二级多标签认知编码，不进行任何三级编码。

${prompt}

【统一编码与返回规则】
- 只对 author_role 为“同学”的当前批次发言编码；教师和机器人仅作上下文。
- 每条消息可以为零个、一个或多个二级编码，同一 code 每条消息只能返回一个对象。如果同一编码有多段支撑，请选择最直接、最充分且能在原文中连续定位的 evidence，并在 reason 中综合说明，不得把同一 code 拆成多个重复对象。
- 每个编码必须分别返回 code、当前消息中的连续原文 evidence 和中文 reason。
- 必须且只能为当前批次每个 message_id 返回一条记录；无编码也必须返回 codes: []。
- level_3_codes 必须始终返回空数组 []。
- 只返回严格合法的纯 JSON，不得包含 Markdown 或额外文字。`;
}

function secondaryUserPrompt(discussionId: string, topic: any, allMessages: any[], targetMessages: any[], language: "zh" | "en" = "zh"): string {
  if (language === "en") {
    return `Return second-level cognitive-presence coding for every current-batch student message and preserve the original author names from the XML.
discussion_id: ${discussionId}
course_type: secondary_only

[Discussion topic]
Title: ${typeof topic?.title === "string" && topic.title.trim() ? topic.title : "No title provided"}
Content: ${typeof topic?.content === "string" && topic.content.trim() ? topic.content : "No topic content provided"}

[Context messages: for interpretation only; do not code]
${JSON.stringify(getBatchMessageContext(allMessages, targetMessages), null, 2)}

[Current-batch coding targets: code and return every item]
${JSON.stringify(targetMessages, null, 2)}

Return exactly these message_id values: ${targetMessages.map(message => message.id).join(", ")}. The only top-level fields are discussion_id, course_type, and coding_results.`;
  }
  return `请逐条返回当前批次学生发言的二级认知编码结果，并保留 XML 中的原始姓名。
discussion_id：${discussionId}
course_type：secondary_only

【讨论主题】
标题：${typeof topic?.title === "string" && topic.title.trim() ? topic.title : "未提供标题"}
内容：${typeof topic?.content === "string" && topic.content.trim() ? topic.content : "未提供主题内容"}

【背景消息：仅用于理解，禁止编码】
${JSON.stringify(getBatchMessageContext(allMessages, targetMessages), null, 2)}

【当前批次编码对象：必须逐条编码且全部返回】
${JSON.stringify(targetMessages, null, 2)}

本批必须且只能返回这些 message_id：${targetMessages.map(message => message.id).join("、")}。顶级字段必须为 discussion_id、course_type 和 coding_results。`;
}

function rawItemForMessage(rawOutputs: any[], messageId: string): any[] {
  const items: any[] = [];
  for (const output of rawOutputs) {
    const matched = output?.coding_results?.find((item: any) => item?.message_id === messageId);
    if (matched) items.push(matched);
  }
  return items;
}

async function analyzeSecondaryGenerationSlot(params: {
  discussionId: string;
  topic: any;
  allMessages: any[];
  targetMessages: any[];
  prompt: string;
  modelConfig: ResolvedExperimentModelConfig;
  language?: "zh" | "en";
}): Promise<any> {
  const rawOutputs: any[] = [];
  const acceptedOutputs: any[] = [];
  const calls: any[] = [];
  const invokeOnce = async (requestedMessages: any[]) => {
    const called = await callExperimentWithRetry({
      config: params.modelConfig,
      messages: [
        { role: "system", content: secondarySystemInstruction(params.prompt, params.language) },
        { role: "user", content: secondaryUserPrompt(params.discussionId, params.topic, params.allMessages, requestedMessages, params.language) }
      ],
      responseFormat: createSecondaryResponseFormat(params.discussionId, requestedMessages),
      temperature: params.modelConfig.temperature
    });
    calls.push(...called.attempts);
    rawOutputs.push(called.result.parsed);
    return called.result.parsed;
  };

  const assertUniqueMessageRecords = (parsed: any) => {
    if (!Array.isArray(parsed?.coding_results)) return;
    const seen = new Set<string>();
    for (const item of parsed.coding_results) {
      if (typeof item?.message_id !== "string") continue;
      if (seen.has(item.message_id)) {
        throw new ModelResponseValidationError(`消息 ${item.message_id} 在 coding_results 中重复出现。`);
      }
      seen.add(item.message_id);
    }
  };

  const invoke = async (requestedMessages: any[]) => {
    let parsed = await invokeOnce(requestedMessages);
    try {
      assertUniqueMessageRecords(parsed);
      acceptedOutputs.push(parsed);
      return parsed;
    } catch {
      parsed = await invokeOnce(requestedMessages);
      assertUniqueMessageRecords(parsed);
      acceptedOutputs.push(parsed);
      return parsed;
    }
  };

  const initial = await invoke(params.targetMessages);
  const missing = getMissingTargetMessages(params.targetMessages, initial);
  if (missing.length > 0) {
    const recovered = await mapWithConcurrency(missing, CODING_BATCH_CONCURRENCY, message => invoke([message]));
    void recovered;
  }
  const combined = {
    discussion_id: params.discussionId,
    course_type: "secondary_only",
    coding_results: acceptedOutputs.flatMap(output => Array.isArray(output?.coding_results) ? output.coding_results : [])
  };
  const stillMissing = getMissingTargetMessages(params.targetMessages, combined);
  if (stillMissing.length > 0) throw new ModelResponseValidationError(`补调后仍缺少消息：${stillMissing.map(message => message.id).join("、")}`);
  let validated: any;
  try {
    validated = validateSecondaryResults(params.discussionId, params.targetMessages, combined);
  } catch (error: any) {
    throw new ModelResponseValidationError(error.message);
  }
  return { rawOutputs, calls, validated };
}

function mergeSecondaryAnalyses(discussionId: string, studentMessages: any[], analyses: any[]): any {
  const byId = new Map<string, any>();
  const issues: string[] = [];
  for (const analysis of analyses) {
    for (const result of analysis.coding_results || []) byId.set(result.message_id, result);
    if (Array.isArray(analysis.validation_issues)) issues.push(...analysis.validation_issues);
  }
  const missing = studentMessages.filter(message => !byId.has(message.id));
  if (missing.length) throw new ModelResponseValidationError(`批次汇总缺少消息：${missing.map(message => message.id).join("、")}`);
  return {
    discussion_id: discussionId,
    course_type: "secondary_only",
    coding_results: studentMessages.map(message => byId.get(message.id)),
    validation_issues: issues,
    ...(issues.length ? { warning: `模型返回中有 ${issues.length} 项校验或规范化提示。${issues.slice(0, 5).join("；")}${issues.length > 5 ? `；另有 ${issues.length - 5} 项` : ""}。` } : {})
  };
}

async function writeExperimentFile(experiment: any): Promise<void> {
  await fs.mkdir(SECONDARY_EXPERIMENT_DIR, { recursive: true });
  experiment.updated_at = new Date().toISOString();
  const finalPath = path.join(SECONDARY_EXPERIMENT_DIR, `${experiment.experiment_run_id}.json`);
  const temporaryPath = `${finalPath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, JSON.stringify(experiment, null, 2), "utf8");
  await fs.rename(temporaryPath, finalPath);
}

function safeExperimentId(raw: string): string {
  if (!/^m3-[A-Za-z0-9-]+$/.test(raw)) throw new Error("实验运行 ID 非法。");
  return raw;
}

async function readExperimentFile(rawId: string): Promise<any> {
  const id = safeExperimentId(rawId);
  return JSON.parse(await fs.readFile(path.join(SECONDARY_EXPERIMENT_DIR, `${id}.json`), "utf8"));
}

function screeningUserPrompt(params: {
  topic: any;
  allMessages: any[];
  targetMessages: any[];
  candidatesByMessage: Record<string, Record<CandidateAlias, any[]>>;
  language?: "zh" | "en";
}): string {
  const messageIds = params.targetMessages.map(message => message.id);
  const tasks = params.targetMessages.map(message => ({
    message_id: message.id,
    context: getBatchMessageContext(params.allMessages, [message]),
    target_message: message,
    candidates: (["A", "B", "C"] as CandidateAlias[]).map(alias => ({
      candidate_alias: alias,
      codes: (params.candidatesByMessage[message.id]?.[alias] || []).map(item => ({
        code: item.code,
        evidence_items: Array.isArray(item.evidence_items) && item.evidence_items.length
          ? item.evidence_items
          : [{ evidence: item.evidence, reason: item.reason }]
      }))
    }))
  }));
  const scoreTemplate = {
    definition_match: 1,
    evidence_sufficiency: 1,
    coverage_completeness: 1,
    coding_precision: 1,
    reasoning_quality: 1,
    total_score: 5,
    unsupported_labels: [],
    potential_missing_labels: [],
    evaluation_reason: params.language === "en" ? "Explain this candidate's score" : "填写该候选的评价理由"
  };
  const outputTemplate = {
    screening_results: [{
      message_id: messageIds[0] || (params.language === "en" ? "Copy the target message ID exactly" : "原样填写待筛选消息ID"),
      candidate_scores: {
        A: scoreTemplate,
        B: scoreTemplate,
        C: scoreTemplate
      },
      selected_candidate: "A",
      tie_candidates: [],
      selection_reason: params.language === "en" ? "Explain why this complete candidate was selected" : "填写选择完整候选的理由"
    }]
  };
  if (params.language === "en") {
    return `Use the complete second-level cognitive-presence Codebook to evaluate the three anonymized candidates for each message independently and select the best complete candidate.

[Complete second-level cognitive-presence Codebook]
${SECOND_LEVEL_CODING_PROMPT_EN}

[Discussion topic]
${JSON.stringify(params.topic || {}, null, 2)}

[Screening tasks]
${JSON.stringify(tasks, null, 2)}

[Only permitted response structure]
${JSON.stringify(outputTemplate, null, 2)}

Follow exactly these four response rules:
1. Return one record for each of these IDs: ${messageIds.join(", ")}. Use exactly the fields shown in the JSON example.
2. Each of the five dimension scores must be 0, 1, or 2. total_score must equal their sum (0-10). The example score of 1 only shows field placement; score each candidate independently on its actual quality.
3. With no numerical tie, select the highest-scoring A, B, or C and return tie_candidates: []. When top candidates have identical total and dimension scores, list all numerical ties in tie_candidates. You may select one after further comparison of labels, evidence, and reasons, and must explain the choice in selection_reason. Return TIE only when they truly cannot be distinguished.
4. Return one strict JSON object only. Do not output Markdown, code fences, <think>, a preface, or any non-JSON text.`;
  }
  return `请依据完整二级认知编码Codebook，对每条消息的三个匿名候选独立评价并选择质量最高的完整候选。

【完整二级认知编码Codebook（含示例）】
${SECOND_LEVEL_CODING_PROMPT}

【讨论主题】
${JSON.stringify(params.topic || {}, null, 2)}

【待筛选任务】
${JSON.stringify(tasks, null, 2)}

【唯一允许的返回结构】
${JSON.stringify(outputTemplate, null, 2)}

只遵守以下4条返回规则：
1. 为 ${messageIds.join("、")} 各返回一条记录，字段结构与上述JSON样例完全一致。
2. 五项评分只能为0、1、2；total_score必须等于五项评分之和（范围0—10）。上述结构样例中的1分仅用于展示字段位置，必须根据每个候选的实际质量独立评分。
3. 无数值并列时选择最高分的A、B或C且tie_candidates为[]；最高分候选的总分和五项评分完全相同时，tie_candidates必须列出全部数值并列候选。你可以依据对标签、证据和理由的进一步比较选择其中一个并在selection_reason中明确说明；确实无法区分时才选择TIE。
4. 只能返回一个严格合法的JSON对象；禁止Markdown、代码围栏、<think>、前言或任何JSON以外文字。`;
}

function screeningResponseFormat(messageIds: string[]): any {
  return createJsonSchemaResponseFormat("cscl_secondary_candidate_screening", createScreeningJsonSchema(messageIds));
}

async function screenCandidateBatch(params: {
  topic: any;
  allMessages: any[];
  targetMessages: any[];
  candidatesByMessage: Record<string, Record<CandidateAlias, any[]>>;
  modelConfig: ResolvedExperimentModelConfig;
  language?: "zh" | "en";
}): Promise<{ results: any[]; rawOutputs: any[]; calls: any[] }> {
  const rawOutputs: any[] = [];
  const calls: any[] = [];
  const screeningValidationError = (message: string) => {
    const error: any = new ModelResponseValidationError(message);
    error.screeningRawOutputs = rawOutputs;
    error.screeningCallRecords = calls;
    return error;
  };
  const invoke = async (messages: any[]) => {
    let pendingMessages = [...messages];
    const acceptedResults: any[] = [];
    let correctionReason = "";
    for (let formatAttempt = 1; formatAttempt <= 2; formatAttempt += 1) {
      const basePrompt = screeningUserPrompt({ ...params, targetMessages: pendingMessages });
      const correctionPrompt = correctionReason
        ? params.language === "en"
          ? `${basePrompt}\n\n[Format-correction retry]\nThe previous response failed validation: ${correctionReason}\nRepeat the same screening task using only the permitted response structure. Do not explain the error or reuse invalid fields.`
          : `${basePrompt}\n\n【格式纠正重试】\n上一次返回未通过系统校验：${correctionReason}\n请重新完成相同筛选任务，严格使用“唯一允许的返回结构”。不要解释错误，不要沿用错误字段。`
        : basePrompt;
      const called = await callExperimentWithRetry({
        config: params.modelConfig,
        messages: [
          { role: "system", content: params.language === "en" ? SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT_EN : SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT },
          { role: "user", content: correctionPrompt }
        ],
        responseFormat: screeningResponseFormat(pendingMessages.map(message => message.id)),
        temperature: params.modelConfig.temperature
      });
      calls.push(...called.attempts);
      rawOutputs.push(called.result.parsed);
      try {
        const returned = called.result.parsed?.screening_results;
        if (!Array.isArray(returned)) throw new Error("筛选模型缺少 screening_results 数组。");
        const requestedIds = new Set(pendingMessages.map(message => message.id));
        const returnedIds = new Set<string>();
        const invalidReasons = new Map<string, string>();
        for (const item of returned) {
          if (!item || typeof item.message_id !== "string" || !requestedIds.has(item.message_id)) {
            throw new Error("筛选结果包含未知或无效的 message_id。");
          }
          if (returnedIds.has(item.message_id)) {
            throw new Error(`筛选结果中消息 ${item.message_id} 重复出现。`);
          }
          returnedIds.add(item.message_id);
          try {
            acceptedResults.push(validateJudgeResult(item.message_id, item));
          } catch (error: any) {
            invalidReasons.set(item.message_id, error?.message || String(error));
          }
        }
        if (invalidReasons.size === 0) {
          return acceptedResults;
        }
        correctionReason = [...invalidReasons.values()].join("；");
        pendingMessages = pendingMessages.filter(message => invalidReasons.has(message.id));
        if (formatAttempt === 2) {
          throw screeningValidationError(`筛选格式纠正重试后仍失败：${correctionReason}`);
        }
      } catch (error: any) {
        if (error instanceof ModelResponseValidationError && (error as any).screeningRawOutputs) throw error;
        correctionReason = error?.message || String(error);
        if (formatAttempt === 2) throw screeningValidationError(`筛选格式纠正重试后仍失败：${correctionReason}`);
      }
    }
    throw screeningValidationError("筛选模型格式纠正重试失败。");
  };
  const initial = await invoke(params.targetMessages);
  const returnedIds = new Set(initial.map((item: any) => item?.message_id).filter(Boolean));
  const missing = params.targetMessages.filter(message => !returnedIds.has(message.id));
  const recovered = missing.length
    ? await mapWithConcurrency(missing, CODING_BATCH_CONCURRENCY, async message => invoke([message]))
    : [];
  const combined = [...initial, ...recovered.flat()];
  const byId = new Map(combined.map((item: any) => [item.message_id, item]));
  const results = params.targetMessages.map(message => {
    const raw = byId.get(message.id);
    if (!raw) throw screeningValidationError(`筛选补调后仍缺少消息 ${message.id}。`);
    try {
      return validateJudgeResult(message.id, raw);
    } catch (error: any) {
      const wrapped: any = new ModelResponseValidationError(error.message);
      wrapped.screeningRawOutputs = rawOutputs;
      wrapped.screeningCallRecords = calls;
      throw wrapped;
    }
  });
  return { results, rawOutputs, calls };
}

app.get("/api/secondary-experiments/:experimentRunId", async (req, res) => {
  try {
    const experiment = await readExperimentFile(req.params.experimentRunId);
    res.type("application/json; charset=utf-8").send(JSON.stringify(experiment, null, 2));
  } catch (error: any) {
    res.status(error?.code === "ENOENT" ? 404 : 400).json({ error: error.message });
  }
});

app.get("/api/secondary-experiments/:experimentRunId/export/:kind", async (req, res) => {
  try {
    const experiment = await readExperimentFile(req.params.experimentRunId);
    if (req.params.kind === "candidates.csv") {
      res.type("text/csv; charset=utf-8").send(candidateRecordsToCsv(experiment.candidate_records || []));
      return;
    }
    if (req.params.kind === "labels.csv") {
      res.type("text/csv; charset=utf-8").send(labelRecordsToCsv(experiment.candidate_records || []));
      return;
    }
    res.status(404).json({ error: "不支持的实验导出类型。" });
  } catch (error: any) {
    res.status(error?.code === "ENOENT" ? 404 : 400).json({ error: error.message });
  }
});

app.post("/api/secondary-experiment", async (req, res) => {
  try {
    const { discussion_id, topic, messages, generationModelConfig, screeningModelConfig } = req.body;
    const language: "zh" | "en" = req.body?.language === "en" ? "en" : "zh";
    if (typeof discussion_id !== "string" || !discussion_id.trim() || !Array.isArray(messages)) {
      return res.status(400).json({ error: "discussion_id 必须是非空字符串，messages 必须是数组。" });
    }
    const method: ExperimentMethod = "M3";
    const malformed = messages.find((message: any) =>
      !message ||
      typeof message.id !== "string" || !message.id.trim() ||
      typeof message.author !== "string" || !message.author.trim() ||
      typeof message.author_role !== "string" ||
      typeof message.content !== "string" || !message.content.trim()
    );
    if (malformed) return res.status(400).json({ error: "messages 中存在结构不完整的消息。" });
    const supportedRoles = new Set(["同学", "教师", "机器人"]);
    if (messages.some((message: any) => !supportedRoles.has(message.author_role))) {
      return res.status(400).json({ error: "messages 中存在无法识别的作者角色，只允许同学、教师或机器人。" });
    }
    if (new Set(messages.map((message: any) => message.id)).size !== messages.length) return res.status(400).json({ error: "messages 中存在重复的消息 ID。" });
    const promptMessages = language === "en" ? messages.map((message: any) => ({
      ...message,
      author_role: message.author_role === "同学" ? "Student" : message.author_role === "教师" ? "Teacher" : "Robot"
    })) : messages;
    const studentMessages = promptMessages.filter((message: any) => message.author_role === (language === "en" ? "Student" : "同学"));
    if (studentMessages.length === 0) {
      return res.status(400).json({ error: "当前讨论中没有可编码的学生发言，无法开始实验。" });
    }
    const generationConfig = resolveExperimentModelConfig(generationModelConfig, { requireExplicit: false, role: "生成" });
    const prompt = language === "en" ? SECOND_LEVEL_CODING_PROMPT_EN : SECOND_LEVEL_CODING_PROMPT;
    const promptVersion = language === "en" ? SECONDARY_M3_GENERATION_PROMPT_VERSION_EN : SECONDARY_M3_GENERATION_PROMPT_VERSION_ZH;
    const batches = chunkMessages(studentMessages, CODING_BATCH_SIZE);

    const screeningConfig = resolveExperimentModelConfig(screeningModelConfig, { requireExplicit: true, role: "筛选" });
    const experimentRunId = createExperimentRunId();
    const randomSeed = randomUUID();
    const createdAt = new Date().toISOString();
    const candidateRecords: any[] = [];
    const candidateMapping: Record<string, Record<CandidateAlias, GenerationId>> = {};
    const candidatesByMessage: Record<string, Record<CandidateAlias, any[]>> = {};
    const experiment: any = {
      experiment_run_id: experimentRunId,
      discussion_id,
      experiment_method: "M3",
      language,
      status: "generation_in_progress",
      generator_model: generationConfig.model,
      screening_model: screeningConfig.model,
      generation_count: 3,
      candidate_records: candidateRecords,
      candidate_mapping: candidateMapping,
      generation_call_records: [],
      candidate_raw_outputs: [],
      candidate_validated_outputs: [],
      screening_results: [],
      screening_scores: {},
      selected_candidates: {},
      screening_raw_outputs: [],
      screening_call_records: [],
      final_coding_results: [],
      tie_records: [],
      random_seed: randomSeed,
      generation_config: publicModelConfig(generationConfig),
      screening_config: publicModelConfig(screeningConfig),
      generator_prompt_version: promptVersion,
      screening_prompt_version: language === "en" ? SECONDARY_M3_SCREENING_PROMPT_VERSION_EN : SECONDARY_M3_SCREENING_PROMPT_VERSION,
      created_at: createdAt,
      updated_at: createdAt
    };
    await writeExperimentFile(experiment);
    let persistenceQueue = Promise.resolve();
    const persistExperiment = () => {
      persistenceQueue = persistenceQueue.then(() => writeExperimentFile(experiment));
      return persistenceQueue;
    };

    try {
      await runCodingBatchPlan(batches, async targetMessages => {
        for (const message of targetMessages) {
          const mapping = candidateMappingForMessage(randomSeed, message.id);
          candidateMapping[message.id] = mapping;
          candidatesByMessage[message.id] = { A: [], B: [], C: [] };
        }

        const settledSlots = await Promise.allSettled(([1, 2, 3] as const).map(async generationIndex => {
          const generationId = `generation_${generationIndex}` as GenerationId;
          const analysis = await analyzeSecondaryGenerationSlot({
            discussionId: discussion_id,
            topic,
            allMessages: promptMessages,
            targetMessages,
            prompt,
            modelConfig: generationConfig,
            language
          });
          const slot = { generationIndex, generationId, ...analysis };
          for (const message of targetMessages) {
            const mapping = candidateMapping[message.id];
            const alias = (Object.entries(mapping).find(([, generationId]) => generationId === slot.generationId)?.[0] || "A") as CandidateAlias;
            const validated = slot.validated.coding_results.find((item: any) => item.message_id === message.id) || { codes: [] };
            const rawItems = rawItemForMessage(slot.rawOutputs, message.id);
            const messageIssues = (slot.validated.validation_issues || []).filter((issue: string) => issue.includes(`消息 ${message.id}`));
            candidatesByMessage[message.id][alias] = validated.codes;
            candidateRecords.push({
              experiment_run_id: experimentRunId, discussion_id, message_id: message.id, author: message.author,
              source_text: message.content, context: getRelevantMessageContext(promptMessages, message),
              generation_index: slot.generationIndex, generation_id: slot.generationId, candidate_alias: alias,
              raw_codes: rawItems.flatMap(item => Array.isArray(item.codes) ? item.codes : []),
              validated_codes: validated.codes, raw_model_output: rawItems,
              validation_passed: messageIssues.length === 0, validation_issues: messageIssues,
              selected: false, judge_scores: null, judge_reason: null,
              generator_model: generationConfig.model, screening_model: screeningConfig.model,
              generator_prompt_version: promptVersion,
              screening_prompt_version: language === "en" ? SECONDARY_M3_SCREENING_PROMPT_VERSION_EN : SECONDARY_M3_SCREENING_PROMPT_VERSION,
              generation_config: publicModelConfig(generationConfig), screening_config: publicModelConfig(screeningConfig),
              generated_at: slot.calls.find((call: any) => call.completed_at)?.completed_at || createdAt
            });
          }
          experiment.generation_call_records.push(...slot.calls.map((call: any) => ({ ...call, generation_id: slot.generationId })));
          experiment.candidate_raw_outputs.push({ generation_id: slot.generationId, outputs: slot.rawOutputs });
          experiment.candidate_validated_outputs.push({ generation_id: slot.generationId, output: slot.validated });
          await persistExperiment();
          return slot;
        }));

        const failedSlots = settledSlots.filter((slot): slot is PromiseRejectedResult => slot.status === "rejected");
        for (const [slotIndex, settledSlot] of settledSlots.entries()) {
          if (settledSlot.status !== "rejected") continue;
          const failed = settledSlot;
          if (Array.isArray(failed.reason?.callAttempts)) {
            experiment.generation_call_records.push(...failed.reason.callAttempts.map((call: any) => ({
              ...call,
              generation_id: `generation_${slotIndex + 1}`
            })));
          }
        }
        if (failedSlots.length > 0) {
          await persistExperiment();
          throw failedSlots[0].reason;
        }
        return true;
      });
      experiment.status = "candidates_persisted";
      await persistExperiment();
    } catch (generationError: any) {
      experiment.status = "generation_failed";
      experiment.generation_error = redactSecrets(generationError?.message || generationError, [generationConfig.apiKey, screeningConfig.apiKey]);
      await persistExperiment();
      const savedCandidateCount = experiment.candidate_records.length;
      return res.status(502).json({
        error: savedCandidateCount > 0
          ? language === "en" ? `M3 generation stopped; ${savedCandidateCount} generated candidates were saved: ${experiment.generation_error}` : `M3 生成阶段中断；已保存 ${savedCandidateCount} 条已生成候选：${experiment.generation_error}`
          : language === "en" ? `M3 generation failed before any candidate was produced; diagnostics were saved: ${experiment.generation_error}` : `M3 生成请求在产生候选前失败；已保存实验诊断记录：${experiment.generation_error}`,
        experiment_run_id: experimentRunId,
        experiment_status: "generation_failed",
        saved_candidate_count: savedCandidateCount,
        export_urls: {
          json: `/api/secondary-experiments/${experimentRunId}`,
          candidate_csv: `/api/secondary-experiments/${experimentRunId}/export/candidates.csv`,
          label_csv: `/api/secondary-experiments/${experimentRunId}/export/labels.csv`
        }
      });
    }

    try {
      const screeningBatches = await runCodingBatchPlan(batches, targetMessages => screenCandidateBatch({
        topic,
        allMessages: promptMessages,
        targetMessages,
        candidatesByMessage,
        modelConfig: screeningConfig,
        language
      }));
      experiment.screening_results = screeningBatches.flatMap(batch => batch.results);
      experiment.screening_raw_outputs = screeningBatches.flatMap(batch => batch.rawOutputs);
      experiment.screening_call_records = screeningBatches.flatMap(batch => batch.calls);

      const finalResults = studentMessages.map((message: any) => {
        const judge = experiment.screening_results.find((item: any) => item.message_id === message.id);
        let selectedAlias = judge.selected_candidate as CandidateAlias;
        if (judge.selected_candidate === "TIE") {
          const originalTieCandidates = [...judge.tie_candidates] as CandidateAlias[];
          const normalizedTieCandidates = [...new Set(originalTieCandidates)].sort() as CandidateAlias[];
          selectedAlias = chooseTieCandidate(randomSeed, message.id, normalizedTieCandidates);
          experiment.tie_records.push({
            message_id: message.id,
            tie_candidates_original: originalTieCandidates,
            tie_candidates_normalized: normalizedTieCandidates,
            random_seed: randomSeed,
            randomly_selected: selectedAlias,
            resolution_method: "seeded_random_after_model_tie",
            model_selection_reason: judge.selection_reason
          });
        } else if (Array.isArray(judge.tie_candidates) && judge.tie_candidates.length > 1) {
          experiment.tie_records.push({
            message_id: message.id,
            tie_candidates_original: [...judge.tie_candidates],
            tie_candidates_normalized: [...new Set(judge.tie_candidates)].sort(),
            model_selected: selectedAlias,
            resolution_method: "model_qualitative_tiebreak",
            model_selection_reason: judge.selection_reason
          });
        }
        experiment.screening_scores[message.id] = judge.candidate_scores;
        experiment.selected_candidates[message.id] = selectedAlias;
        const selectedRecord = candidateRecords.find(record => record.message_id === message.id && record.candidate_alias === selectedAlias);
        for (const record of candidateRecords.filter(record => record.message_id === message.id)) {
          record.judge_scores = judge.candidate_scores[record.candidate_alias as CandidateAlias];
          record.judge_reason = judge.candidate_scores[record.candidate_alias as CandidateAlias].evaluation_reason;
          record.selected = record.candidate_alias === selectedAlias;
          if (record.selected) record.screening_reason = judge.selection_reason;
        }
        return { message_id: message.id, author: message.author, codes: selectedRecord.validated_codes, level_3_codes: [] };
      });
      experiment.final_coding_results = finalResults;
      experiment.status = "completed";
      await writeExperimentFile(experiment);
      return res.json({
        discussion_id,
        course_type: "secondary_only",
        experiment_method: "M3",
        coding_results: finalResults,
        api_provider: language === "en" ? `M3 three-candidate generation (${generationConfig.provider}) + independent judge (${screeningConfig.provider})` : `M3 三候选生成（${generationConfig.provider}）＋独立筛选（${screeningConfig.provider}）`,
        model_name: generationConfig.model,
        prompt_version: promptVersion,
        generated_at: experiment.updated_at,
        experiment_metadata: experiment
      });
    } catch (screeningError: any) {
      if (Array.isArray(screeningError?.screeningRawOutputs)) experiment.screening_raw_outputs.push(...screeningError.screeningRawOutputs);
      if (Array.isArray(screeningError?.screeningCallRecords)) experiment.screening_call_records.push(...screeningError.screeningCallRecords);
      if (Array.isArray(screeningError?.callAttempts)) experiment.screening_call_records.push(...screeningError.callAttempts);
      experiment.status = "screening_failed";
      experiment.screening_error = redactSecrets(screeningError?.message || screeningError, [generationConfig.apiKey, screeningConfig.apiKey]);
      await writeExperimentFile(experiment);
      return res.status(502).json({
        error: language === "en" ? `M3 candidates were generated and saved, but the judge failed: ${experiment.screening_error}` : `M3 候选已生成并保存，但筛选模型失败：${experiment.screening_error}`,
        experiment_run_id: experimentRunId,
        experiment_status: "screening_failed",
        saved_candidate_count: experiment.candidate_records.length,
        export_urls: {
          json: `/api/secondary-experiments/${experimentRunId}`,
          candidate_csv: `/api/secondary-experiments/${experimentRunId}/export/candidates.csv`,
          label_csv: `/api/secondary-experiments/${experimentRunId}/export/labels.csv`
        }
      });
    }
  } catch (error: any) {
    const safeMessage = redactSecrets(error?.message || error, [req.body?.generationModelConfig?.apiKey, req.body?.screeningModelConfig?.apiKey]);
    console.error("Secondary experiment API failed:", safeMessage);
    const status = error instanceof ModelResponseValidationError ? 502 : 500;
    return res.status(status).json({ error: `二级编码实验失败：${safeMessage}` });
  }
});

// REST API route for coding discussion posts
app.post("/api/code", async (req, res) => {
  try {
    const { discussion_id, topic, messages, customLLM, course_type } = req.body;
    const language: "zh" | "en" = req.body?.language === "en" ? "en" : "zh";

    if (typeof discussion_id !== "string" || !discussion_id.trim() || !Array.isArray(messages)) {
      return res.status(400).json({ error: "discussion_id 必须是非空字符串，messages 必须是数组。" });
    }

    const courseType = course_type || "information_technology_pedagogy";
    const supportedCourseTypes = new Set([
      "information_technology_pedagogy",
      "programming_learning",
      "discipline_frontier"
    ]);
    if (!supportedCourseTypes.has(courseType)) {
      return res.status(400).json({ error: `不支持的课程类型：${courseType}` });
    }

    const malformedMessage = messages.find((message: any) =>
      !message ||
      typeof message.id !== "string" ||
      !message.id.trim() ||
      typeof message.author !== "string" ||
      !message.author.trim() ||
      typeof message.author_role !== "string" ||
      typeof message.content !== "string" ||
      !message.content.trim()
    );
    if (malformedMessage) {
      return res.status(400).json({ error: "messages 中存在结构不完整的消息。" });
    }
    const supportedRoles = new Set(["同学", "教师", "机器人"]);
    if (messages.some((message: any) => !supportedRoles.has(message.author_role))) {
      return res.status(400).json({ error: "messages 中存在无法识别的作者角色，只允许同学、教师或机器人。" });
    }
    const messageIds = new Set(messages.map((message: any) => message.id));
    if (messageIds.size !== messages.length) {
      return res.status(400).json({ error: "messages 中存在重复的消息 ID。" });
    }

    const studentMessages = messages.filter(m => m.author_role === "同学");
    if (studentMessages.length === 0) {
      return res.status(400).json({ error: "当前讨论中没有可编码的学生发言，无法开始分析。" });
    }

    // Prepare prompt based on course selection
    let thirdLevelPrompt = "";
    if (courseType === "programming_learning") {
      thirdLevelPrompt = language === "en" ? PROGRAMMING_LEARNING_THIRD_LEVEL_PROMPT_EN : PROGRAMMING_LEARNING_THIRD_LEVEL_PROMPT;
    } else if (courseType === "discipline_frontier") {
      thirdLevelPrompt = language === "en" ? DISCIPLINE_FRONTIER_THIRD_LEVEL_PROMPT_EN : DISCIPLINE_FRONTIER_THIRD_LEVEL_PROMPT;
    } else if (courseType === "information_technology_pedagogy") {
      thirdLevelPrompt = language === "en" ? IT_PEDAGOGY_THIRD_LEVEL_PROMPT_EN : IT_PEDAGOGY_THIRD_LEVEL_PROMPT;
    } else {
      thirdLevelPrompt = `
【课程三级认知存在微观编码：已跳过】
注意：当前没有指定特定的讨论课程类型，因此本轮分析中无需进行课程三级（微观）特征提取。
请确保返回结果中的每一条发言对象对应的 "level_3_codes" 字段均为空数组 []。
`;
    }

    const chineseSystemInstruction = `你是一位严谨的研究生院级别学术助教和CSCL（计算机支持的协作学习）认知编码专家。
你的任务是对本次明确标记的“当前批次学生发言”逐条进行二级多标签认知编码${courseType ? "和课程三级认知存在微观编码" : ""}。

${SECOND_LEVEL_CODING_PROMPT}

${thirdLevelPrompt}

【多级编码联动规则】
- 只对 author_role 为 "同学" 的学生发言进行编码。AI机器人的发言、教师的主题内容绝对不进行编码。
- 每一条学生消息可以包含一至多个二级编码（多标签）。
- 在同一条发言中，同一个二级编码只能返回一个对象并计入1次。如果同一编码有多段支撑，请选择最直接、最充分且能在原文中连续定位的 evidence，并在 reason 中综合说明，不得把同一 code 拆成多个重复对象。
- 每一个被分析出来的二级编码必须提供：
  - code: 上述 12 个合法代码之一
  - evidence: 该学生发言内容中的最小完整且真实的句子/片段作为原文证据（必须能在原文中找到）
  - reason: 中文，用严谨简练的学术语调说明该证据为什么符合其在 Codebook 中的指标和定义
- 每一个被分析出来的学生消息，请在消息对象级别返回一个 "level_3_codes" 数组。每个三级编码必须提供 code、name、evidence 和 reason；evidence 必须是能够在该学生原文中逐字找到的真实连续片段，reason 必须解释该证据为什么符合该三级编码。如果没有匹配到任何三级编码，请返回空数组 []。
- 如果发言有二级认知编码，但没有明确课程三级认知表现，三级编码输出空数组，不得强行分类。
- 三级编码不能反过来决定二级编码，必须先判断认知过程，再判断课程知识或计算思维内容。
- 如果一条发言没有任何符合的认知行为，其 codes 数组可以为空。
- 只有在能够从该学生发言中逐字复制出真实 evidence 时，才允许输出对应的二级或三级编码；找不到原文证据时必须放弃该编码，绝对不能概括、改写或虚构证据。
- 整个讨论的机器人发言、教师主题问题仅作为模型上下文理解讨论逻辑，不进行编码。机器人发言不计入任何频次，不产生编码，不得把机器人回复合并进学生证据句。
- 学生姓名使用 XML 中提供的原始姓名，请在 author 字段中原样返回当前消息的作者姓名，不得改写或重新编号。
- 每次请求包含一至多条“当前编码对象”。必须逐条独立判断，不能把不同学生消息的证据或观点相互合并。
- 背景消息只用于理解讨论主题、指代、回复关系和讨论进程，绝对不能编码，也不能把背景消息中的证据或观点算到当前学生名下。
- 必须且只能为当前批次列出的每个 message_id 返回一条记录，不得遗漏、重复或返回其他消息。即使没有匹配到任何编码，也必须返回该 message_id，其 codes 为空数组 []，level_3_codes 为空数组 []。

【返回JSON格式说明】
你必须返回一个符合以下结构的、严格合法的JSON对象（不要包含任何 markdown 标记、\`\`\`json 块、前导或尾随文本，只返回纯JSON字符串）：
{
  "discussion_id": "和传入的 discussion_id 字符串保持一致",
  "course_type": "${courseType}",
  "coding_results": [
    {
      "message_id": "对应消息 of id (例如 m001)",
      "author": "该学生在 XML 中的原始姓名",
      "codes": [
        {
          "code": "二级代码 (如 I-JA)",
          "evidence": "作为证据 of 发言中的完整连续原文句子/片段",
          "reason": "严谨简练的学术解释"
        }
      ],
      "level_3_codes": [
        {
          "code": "三级代码 (如 C-COND)",
          "name": "条件结构",
          "evidence": "该学生发言中的真实连续原文证据",
          "reason": "该证据符合三级编码定义的具体解释"
        }
      ]
    }
  ]
}
重要：coding_results 必须恰好覆盖当前批次列出的全部编码对象，每个 message_id 一条；不能返回背景消息的记录。若某条消息没有任何可匹配代码，其 "codes" 和 "level_3_codes" 均设为空数组 []。`;

    const englishSystemInstruction = `You are a rigorous graduate-level research assistant and an expert in CSCL cognitive-presence coding.
Code every explicitly marked current student message using second-level multi-label coding and the selected course-specific third-level Codebook.

${SECOND_LEVEL_CODING_PROMPT_EN}

${thirdLevelPrompt}

[Coding rules]
- Code only messages whose author_role is "Student". Teacher and Robot messages are context only.
- A student message may receive zero, one, or multiple second-level labels.
- Within one message, return each second-level code only once. If several passages support the same code, use the most direct and sufficient verbatim passage as evidence and synthesize the support in reason.
- Every second-level item must contain code, evidence, and reason. Evidence must be a verbatim continuous span from the current message; reason must concisely connect that span to the Codebook definition.
- Every result must also contain level_3_codes. Each third-level item must contain code, name, evidence, and reason. Return [] when no third-level code is supported.
- Determine the cognitive process before the course-specific third-level feature; third-level coding must not determine second-level coding.
- Context may clarify the topic, references, reply relations, or discussion sequence, but must never supply evidence for the current message.
- Preserve the original XML author name exactly.
- Return exactly one record for every requested message_id and no other record. When no code applies, still return that message with empty codes and level_3_codes arrays.

[Required JSON output]
Return one strictly valid JSON object only, with no Markdown or surrounding text:
{
  "discussion_id": "exact input discussion_id",
  "course_type": "${courseType}",
  "coding_results": [
    {
      "message_id": "m001",
      "author": "original XML author name",
      "codes": [
        { "code": "I-JA", "evidence": "verbatim evidence", "reason": "concise academic explanation" }
      ],
      "level_3_codes": [
        { "code": "C-COND", "name": "Conditionals", "evidence": "verbatim evidence", "reason": "specific explanation" }
      ]
    }
  ]
}
coding_results must cover every requested message_id exactly once. Do not return context messages.`;

    const systemInstruction = language === "en" ? englishSystemInstruction : chineseSystemInstruction;

    const localizePromptMessage = (message: any) => language === "en"
      ? {
          ...message,
          author_role: message.author_role === "同学" ? "Student" : message.author_role === "教师" ? "Teacher" : "Robot"
        }
      : message;

    const buildChineseUserPrompt = (targetMessages: any[]) => `请按照指定格式，逐条返回当前批次学生发言的认知及课程三级编码结果。保留 XML 中的原始姓名。
当前选择的课程类型是：${courseType === "programming_learning" ? "编程学习" : (courseType === "discipline_frontier" ? "学科前沿展示" : (courseType === "information_technology_pedagogy" ? "信息技术教学法" : "未选定（仅分析二级）"))}。
讨论主题：
标题：${typeof topic?.title === "string" && topic.title.trim() ? topic.title : "未提供标题"}
内容：${typeof topic?.content === "string" && topic.content.trim()
  ? topic.content
  : (messages.find(m => m.type === "topic")?.content || "未提供主题内容")}

【背景消息：仅用于理解，禁止编码】
${JSON.stringify(getBatchMessageContext(messages, targetMessages), null, 2)}

【当前批次编码对象：必须逐条编码且全部返回】
${JSON.stringify(targetMessages, null, 2)}

本批必须返回且只能返回以下 message_id：${targetMessages.map(message => message.id).join("、")}。
coding_results 中每个ID必须恰好出现一次；没有匹配编码时仍须返回空数组。必须严格符合规定的 JSON 结构，并使用 "coding_results" 作为顶级字段键名。`;

    const buildEnglishUserPrompt = (targetMessages: any[]) => `Return the cognitive and course-specific third-level coding for every current student message in the required JSON structure. Preserve original XML author names.
Selected course type: ${courseType}.
Discussion topic:
Title: ${typeof topic?.title === "string" && topic.title.trim() ? topic.title : "No title provided"}
Content: ${typeof topic?.content === "string" && topic.content.trim()
  ? topic.content
  : (messages.find((message: any) => message.type === "topic")?.content || "No topic content provided")}

[Context messages: for interpretation only; do not code]
${JSON.stringify(getBatchMessageContext(messages, targetMessages).map(localizePromptMessage), null, 2)}

[Current messages: code every item and return every item]
${JSON.stringify(targetMessages.map(localizePromptMessage), null, 2)}

Return exactly these message_id values: ${targetMessages.map(message => message.id).join(", ")}.
Each ID must occur exactly once in coding_results. Use empty arrays when no code applies. The top-level result key must be "coding_results".`;

    const buildUserPrompt = language === "en" ? buildEnglishUserPrompt : buildChineseUserPrompt;

    const userApiKey = typeof customLLM?.apiKey === "string" ? customLLM.apiKey.trim() : "";
    const userBaseUrl = typeof customLLM?.baseUrl === "string" ? customLLM.baseUrl.trim() : "";
    const userModel = typeof customLLM?.model === "string" ? customLLM.model.trim() : "";

    const envApiKey = process.env.LLM_API_KEY?.trim() || "";
    const envBaseUrl = process.env.LLM_BASE_URL?.trim() || "";
    const envModel = process.env.LLM_MODEL?.trim() || "";

    const customBaseUrl = userBaseUrl || envBaseUrl;
    const customModel = userModel || envModel;
    const apiKey = userApiKey || envApiKey;

    if (!apiKey) {
      console.log("No API key found for the selected model provider.");
      return res.status(400).json({
        error: "系统未检测到当前模型提供商的 API Key。请在“模型设置”中填写 API Key，或配置对应的服务器环境变量。"
      });
    }
    const messageBatches = chunkMessages(studentMessages, CODING_BATCH_SIZE);

    // Use the configured OpenAI or OpenAI-compatible LLM endpoint.
    const baseUrl = customBaseUrl || "https://api.openai.com/v1";
    const model = customModel || "gpt-4o-mini";
    console.log(`Calling ${baseUrl} with model ${model} in batches of ${CODING_BATCH_SIZE} (concurrency ${CODING_BATCH_CONCURRENCY})`);
    try {
        if (isOfficialOpenAIBaseUrl(baseUrl)) {
          const analyses = await runCodingBatchPlan(messageBatches, targetMessages =>
            analyzeBatchWithMissingRecovery({
              discussionId: discussion_id,
              courseType,
              targetMessages,
              callModel: async requestedMessages => {
              const content = await callOfficialOpenAIEndpoint({
                apiKey,
                baseUrl,
                model,
                messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: buildUserPrompt(requestedMessages) }
                ],
                responseFormat: createOpenAIStructuredResponseFormat(discussion_id, courseType, requestedMessages),
                temperature: DEFAULT_MODEL_TEMPERATURE
              });
              return parseModelJson(content);
              }
            })
          );
          const validated = mergeBatchAnalyses(
            discussion_id,
            courseType,
            studentMessages,
            analyses.map(analysis => analysis.validated)
          );
          return res.json(createAuditedAnalysisResponse(
            validated,
            analyses.map(analysis => analysis.raw),
            `OpenAI 官方 API（Python SDK，严格 JSON Schema，每批最多 ${CODING_BATCH_SIZE} 条，并发 ${CODING_BATCH_CONCURRENCY}）`,
            model,
            "strict_json_schema"
          ));
        }

        const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
        let allCallsUsedStreaming = true;
        const analyses = await runCodingBatchPlan(messageBatches, targetMessages =>
          analyzeBatchWithMissingRecovery({
            discussionId: discussion_id,
            courseType,
            targetMessages,
            callModel: async requestedMessages => {
            const compatibleMessages = [
              { role: "system", content: systemInstruction },
              { role: "user", content: buildUserPrompt(requestedMessages) }
            ];
            let content: string;
            try {
              content = await callOpenAICompatibleEndpoint({
                url,
                apiKey,
                model,
                messages: compatibleMessages,
                responseFormat: { type: "json_object" },
                stream: true,
                temperature: DEFAULT_MODEL_TEMPERATURE
              });
            } catch (error: any) {
              const providerRejectedStreaming = error instanceof OpenAICompatibleApiError
                && [400, 422].includes(error.status)
                && /stream|streaming|sse|流式/i.test(error.message);
              if (!providerRejectedStreaming) throw error;
              console.warn(`Provider ${baseUrl} rejected streaming; retrying current batch without stream.`);
              allCallsUsedStreaming = false;
              content = await callOpenAICompatibleEndpoint({
                url,
                apiKey,
                model,
                messages: compatibleMessages,
                responseFormat: { type: "json_object" },
                stream: false,
                temperature: DEFAULT_MODEL_TEMPERATURE
              });
            }
            return parseModelJson(content);
            }
          })
        );
        const validated = mergeBatchAnalyses(
          discussion_id,
          courseType,
          studentMessages,
          analyses.map(analysis => analysis.validated)
        );
        return res.json(createAuditedAnalysisResponse(
          validated,
          analyses.map(analysis => analysis.raw),
          customBaseUrl
            ? `自定义 OpenAI 兼容接口（JSON mode，${allCallsUsedStreaming ? "流式" : "含普通模式回退"}，每批最多 ${CODING_BATCH_SIZE} 条，并发 ${CODING_BATCH_CONCURRENCY}）`
            : "OpenAI 官方 API",
          model,
          "json_object"
        ));
    } catch (err: any) {
      console.error("OpenAI-compatible API call failed:", err.message);
      const status = err instanceof ModelResponseValidationError ? 502 : 500;
      return res.status(status).json({ error: `调用自定义模型 API 失败。错误原因: ${err.message}` });
    }
  } catch (err: any) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

class ModelResponseValidationError extends Error {
  constructor(message: string) {
    super(`模型返回校验失败：${message}`);
    this.name = "ModelResponseValidationError";
  }
}

function parseModelJson(content: string): any {
  try {
    return parseStrictJsonResponse(content).parsed;
  } catch (error: any) {
    throw new ModelResponseValidationError(error?.message || "返回内容不是严格合法的 JSON。");
  }
}

function parseModelJsonWithMetadata(content: string): { parsed: any; normalizations: string[] } {
  try {
    return parseStrictJsonResponse(content);
  } catch (error: any) {
    throw new ModelResponseValidationError(error?.message || "返回内容不是严格合法的 JSON。");
  }
}

// Validate the LLM output without inventing evidence, reasons, or classifications.
function validateAndNormalizeResults(discussionId: string, studentMessages: any[], parsed: any, courseType?: string): any {
  const course = courseType || "";
  const result: any = {
    discussion_id: discussionId,
    course_type: course,
    coding_results: [],
  };

  const validCodes = new Set<string>(SECOND_LEVEL_CODES);

  const validLevel3Codes = new Set<string>();
  const level3Names: Record<string, string> = {};

  if (course === "programming_learning") {
    const l3Codes = ["C-SEQ", "C-LOOP", "C-COND", "C-OPER", "C-DATA", "P-ITER", "P-DEBUG", "P-REUSE", "P-ABSMOD", "I-EXPRESS", "I-QUESTION"];
    const l3Names = ["顺序结构", "循环结构", "条件结构", "运算操作", "数据", "增量与迭代", "测试与调试", "复用与重混", "抽象与模块化", "计算表达", "计算质疑"];
    l3Codes.forEach((code, idx) => {
      validLevel3Codes.add(code);
      level3Names[code] = l3Names[idx];
    });
  } else if (course === "discipline_frontier") {
    const l3Codes = ["CH-COG", "CH-MOT", "CH-TIME", "CH-ENV", "CH-SOC", "CH-NONE", "ST-COG", "ST-MOT", "ST-TIME", "ST-ENV", "ST-NONE"];
    const l3Names = ["认知挑战", "动机挑战", "时间管理挑战", "环境与技术挑战", "社会互动挑战", "未识别到挑战", "认知调节策略", "动机调节策略", "时间管理策略", "环境建构策略", "未提出有效策略"];
    l3Codes.forEach((code, idx) => {
      validLevel3Codes.add(code);
      level3Names[code] = l3Names[idx];
    });
  } else if (course === "information_technology_pedagogy") {
    const l3Codes = ["EDU-TK", "EDU-PK", "EDU-CK", "EDU-PCK", "EDU-TPK", "EDU-TCK", "EDU-TPACK", "EDU-DK", "EDU-CTX"];
    const l3Names = ["技术知识", "教学法知识", "学科内容知识", "学科教学知识", "技术教学法知识", "技术学科内容知识", "整合性技术教学内容知识", "设计知识", "学校教学情境"];
    l3Codes.forEach((code, idx) => {
      validLevel3Codes.add(code);
      level3Names[code] = l3Names[idx];
    });
  }

  // Create a fast map of message ID to student messages
  const studentMap = new Map<string, any>();
  for (const m of studentMessages) {
    studentMap.set(m.id, m);
  }

  if (!parsed || !Array.isArray(parsed.coding_results)) {
    throw new ModelResponseValidationError("缺少 coding_results 数组。");
  }
  const validationIssues: string[] = [];
  if (typeof parsed.discussion_id === "string" && parsed.discussion_id !== discussionId) {
    validationIssues.push("discussion_id 与请求不一致，已使用请求中的 ID");
  }

  const validatedByMessageId = new Map<string, any>();
  for (const studentMessage of studentMessages) {
    validatedByMessageId.set(studentMessage.id, {
      message_id: studentMessage.id,
      author: studentMessage.author,
      codes: [],
      level_3_codes: []
    });
  }

  for (const item of parsed.coding_results) {
    if (!item || typeof item.message_id !== "string" || !studentMap.has(item.message_id)) {
      validationIssues.push("包含未知、非学生或无效的 message_id，已忽略");
      continue;
    }
    const msgId = item.message_id;
    const validatedItem = validatedByMessageId.get(msgId);
    if (!Array.isArray(item.codes) || !Array.isArray(item.level_3_codes)) {
      validationIssues.push(`消息 ${msgId} 缺少编码数组，已按未识别到编码处理`);
      continue;
    }

    const studentMsg = studentMap.get(msgId);
    const subCodesByCode = new Map<string, any>(validatedItem.codes.map((codeItem: any) => [codeItem.code, codeItem]));
    for (const codeItem of item.codes) {
      const code = typeof codeItem?.code === "string" ? codeItem.code.trim().toUpperCase() : "";
      if (!validCodes.has(code)) {
        validationIssues.push(`消息 ${msgId} 的非法二级编码“${code || "空值"}”已排除`);
        continue;
      }
      const evidence = typeof codeItem.evidence === "string" ? codeItem.evidence.trim() : "";
      if (!evidence || !studentMsg.content.includes(evidence)) {
        validationIssues.push(`消息 ${msgId} 的编码 ${code} 没有可在原文中定位的证据，已排除该编码`);
        continue;
      }
      const reason = typeof codeItem.reason === "string" ? codeItem.reason.trim() : "";
      if (!reason) {
        validationIssues.push(`消息 ${msgId} 的编码 ${code} 缺少模型解释，已排除该编码`);
        continue;
      }
      const existing = subCodesByCode.get(code);
      if (existing) {
        const evidenceItems = Array.isArray(existing.evidence_items) && existing.evidence_items.length
          ? existing.evidence_items
          : (existing.evidence_items = [{ evidence: existing.evidence, reason: existing.reason }]);
        if (evidenceItems.some((pair: any) => pair.evidence === evidence && pair.reason === reason)) {
          validationIssues.push(`消息 ${msgId} 的重复二级编码 ${code} 含完全相同的证据与理由，已忽略重复项`);
        } else {
          evidenceItems.push({ evidence, reason });
          validationIssues.push(`消息 ${msgId} 的重复二级编码 ${code} 已合并其合法证据与理由，标签频次仍计 1 次`);
        }
        continue;
      }
      const normalized = { code, evidence, reason, evidence_items: [{ evidence, reason }] };
      subCodesByCode.set(code, normalized);
      validatedItem.codes.push(normalized);
    }

    const seenLevel3 = new Set<string>(validatedItem.level_3_codes.map((level3Item: any) => level3Item.code));
    for (const level3Item of item.level_3_codes) {
      const code = typeof level3Item?.code === "string" ? level3Item.code.trim().toUpperCase() : "";
      if (!validLevel3Codes.has(code)) {
        validationIssues.push(`消息 ${msgId} 的非法三级编码“${code || "空值"}”已排除`);
        continue;
      }
      if (seenLevel3.has(code)) {
        validationIssues.push(`消息 ${msgId} 的重复三级编码 ${code} 已排除`);
        continue;
      }

      const evidence = typeof level3Item.evidence === "string" ? level3Item.evidence.trim() : "";
      if (!evidence || !studentMsg.content.includes(evidence)) {
        validationIssues.push(`消息 ${msgId} 的三级编码 ${code} 没有可在原文中定位的证据，已排除该编码`);
        continue;
      }
      const reason = typeof level3Item.reason === "string" ? level3Item.reason.trim() : "";
      if (!reason) {
        validationIssues.push(`消息 ${msgId} 的三级编码 ${code} 缺少模型解释，已排除该编码`);
        continue;
      }
      seenLevel3.add(code);
      validatedItem.level_3_codes.push({
        code,
        name: level3Names[code],
        evidence,
        reason
      });
    }
  }

  if (course === "discipline_frontier") {
    for (const studentMessage of studentMessages) {
      const validatedItem = validatedByMessageId.get(studentMessage.id);
      const level3Codes = validatedItem.level_3_codes as Array<{ code: string }>;

      const hasSpecificChallenge = level3Codes.some(item => item.code.startsWith("CH-") && item.code !== "CH-NONE");
      if (hasSpecificChallenge && level3Codes.some(item => item.code === "CH-NONE")) {
        validatedItem.level_3_codes = level3Codes.filter(item => item.code !== "CH-NONE");
        validationIssues.push(`消息 ${studentMessage.id} 已识别到具体挑战，互斥的 CH-NONE 已排除`);
      }

      const remainingLevel3Codes = validatedItem.level_3_codes as Array<{ code: string }>;
      const hasSpecificStrategy = remainingLevel3Codes.some(item => item.code.startsWith("ST-") && item.code !== "ST-NONE");
      if (hasSpecificStrategy && remainingLevel3Codes.some(item => item.code === "ST-NONE")) {
        validatedItem.level_3_codes = remainingLevel3Codes.filter(item => item.code !== "ST-NONE");
        validationIssues.push(`消息 ${studentMessage.id} 已识别到具体策略，互斥的 ST-NONE 已排除`);
      }
    }
  }

  result.coding_results = studentMessages.map(message => validatedByMessageId.get(message.id));
  result.validation_issues = validationIssues;
  if (validationIssues.length > 0) {
    const preview = validationIssues.slice(0, 5).join("；");
    const remaining = validationIssues.length > 5 ? `；另有 ${validationIssues.length - 5} 项` : "";
    result.warning = `模型返回中有 ${validationIssues.length} 项校验或规范化提示。${preview}${remaining}。`;
  }

  return result;
}

// Vite and static file servers setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // In middleware mode a separate HMR listener on localhost:3000 can
        // capture IPv6 page requests and answer "Upgrade Required". The app is
        // used as a stable local tool, so normal page refresh is sufficient.
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CSCL Coding Server] Ready on http://localhost:${PORT}`);
  });
}

startServer();
