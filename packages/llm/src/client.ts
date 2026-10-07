// @spec docs/ARCHITECTURE.md
// 生产 LLM 客户端：Vercel AI SDK 实现。这是唯一调用模型的地方。

import { generateObject, generateText, streamText } from "ai";
import { resolveModel } from "./providers";
import type { ModelConfig } from "./providers";
import { AppError } from "@aiclassroom/types";
import { z } from "zod";
import type {
  LlmClient,
  LlmRequest,
  LlmStreamResult,
  LlmStructuredRequest,
  LlmTextResult,
  LlmUsage,
} from "./types";

type UsageLike =
  | { inputTokens?: number | undefined; outputTokens?: number | undefined }
  | undefined
  | null;

/**
 * usage 只在 Provider 返回时才有值。
 * 缺失记 0 —— 禁止编造。
 */
export function normalizeUsage(usage: UsageLike): LlmUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  };
}

function callOptions(cfg: ModelConfig, request: LlmRequest) {
  return {
    temperature: cfg.temperature,
    maxOutputTokens: cfg.maxOutputTokens,
    abortSignal: request.abortSignal,
    ...(request.system === undefined ? {} : { system: request.system }),
  };
}

export const aiSdkClient: LlmClient = {
  kind: "ai-sdk",

  async generate(cfg: ModelConfig, request: LlmRequest): Promise<LlmTextResult> {
    const model = resolveModel(cfg);
    const result = await generateText({
      model,
      prompt: request.prompt,
      ...callOptions(cfg, request),
    });
    return { text: result.text, usage: normalizeUsage(await result.usage) };
  },

  stream(cfg: ModelConfig, request: LlmRequest): LlmStreamResult {
    const model = resolveModel(cfg);
    const result = streamText({
      model,
      prompt: request.prompt,
      ...callOptions(cfg, request),
    });
    return {
      textStream: result.textStream,
      usage: (async () => normalizeUsage(await result.usage))(),
    };
  },

  async structured<T>(
    cfg: ModelConfig,
    request: LlmStructuredRequest<T>,
  ): Promise<{ object: T; usage: LlmUsage }> {
    const model = resolveModel(cfg);
    // DashScope / 通义千问等 OpenAI-compatible 网关对 generateObject 的
    // response_format=json_object / json_schema 支持不完整（请求被拒或「No object generated」），
    // 且 AI SDK 的 generateObject 不支持 mode:"tool"。故改用「自由文本 + 内嵌 JSON Schema」方案：
    // 模型直接产出 JSON，客户端剥离代码块后按 Zod schema 强校验（已用 raw API 验证可工作）。
    if (cfg.provider === "openai-compatible") {
      return structuredViaText(model, cfg, request);
    }
    // 其余 Provider（OpenAI / Anthropic / Gemini / DeepSeek）：原生 generateObject（json_schema）
    const result = await generateObject({
      model,
      schema: request.schema,
      prompt: request.prompt,
      mode: "auto",
      ...callOptions(cfg, request),
    });
    return {
      object: result.object as T,
      usage: normalizeUsage(await result.usage),
    };
  },
};

/**
 * 从模型自由文本输出中尽力提取 JSON 对象/数组。
 * 兼容：纯 JSON、```json 代码块、前后夹带说明文字。
 */
function extractJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  const tryParse = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    const f = tryParse(fence[1].trim());
    if (f !== undefined) return f;
  }
  const start = trimmed.search(/[{[]/);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (start !== -1 && end > start) {
    return tryParse(trimmed.slice(start, end + 1));
  }
  return undefined;
}

type ResolvedModel = ReturnType<typeof resolveModel>;

async function structuredViaText<T>(
  model: ResolvedModel,
  cfg: ModelConfig,
  request: LlmStructuredRequest<T>,
): Promise<{ object: T; usage: LlmUsage }> {
  let schemaText: string;
  try {
    schemaText = JSON.stringify(z.toJSONSchema(request.schema as z.ZodTypeAny), null, 2);
  } catch {
    schemaText = "(schema 不可序列化为 JSON Schema)";
  }
  const system =
    `${request.system ?? ""}\n\n你必须严格按以下 JSON Schema 输出一个 JSON 对象，禁止输出任何解释性文字、禁止 markdown 代码块标记、禁止额外内容：\n${schemaText}`;
  const result = await generateText({
    model,
    system,
    prompt: request.prompt,
    temperature: cfg.temperature,
    maxOutputTokens: cfg.maxOutputTokens,
    abortSignal: request.abortSignal,
  });
  const parsed = extractJson(result.text);
  if (parsed === undefined) {
    throw new AppError(
      "VALIDATION_ERROR",
      `模型未返回可解析的 JSON：${result.text.slice(0, 200)}`,
      { retryable: true },
    );
  }
  const validated = request.schema.safeParse(parsed);
  if (!validated.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      `模型产出不符合约定结构：${validated.error.issues.map((i) => i.message).join("; ")}`,
      { retryable: true },
    );
  }
  return { object: validated.data as T, usage: normalizeUsage(await result.usage) };
}
