// @spec docs/ARCHITECTURE.md
// 统一 LLM 入口：generate() / stream() / structuredOutput()
// 集中处理：错误分类、超时、指数退避重试、Trace 采集。

import { AppError, createId } from "@aiclassroom/types";
import type { TraceRecord } from "@aiclassroom/types";
import { aiSdkClient } from "./client";
import { classifyError } from "./errors";
import type { ModelConfig } from "./providers";
import { LlmCallError, buildTimeoutTrace, withTrace } from "./trace";
import type { TraceContext } from "./trace";
import type {
  LlmClient,
  LlmRequest,
  LlmStructuredRequest,
  LlmUsage,
} from "./types";

/** 默认重试次数（讲义：LLM 调用失败自动重试 2 次）。注意：仅对非超时错误重试，超时一律快速失败。 */
export const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
/**
 * 单调用超时：90s。
 * 对自建/不稳定 provider（如 hubway），超时的根因通常是网络层挂起，
 * 重试意义不大且会把单步时长放大到 超时×重试次数。故超时设较短且「不重试」（见 withTimeout）。
 */
const DEFAULT_TIMEOUT_MS = 90_000;

export interface CallOptions {
  maxRetries?: number;
  timeoutMs?: number;
  client?: LlmClient;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 指数退避重试。只对 retryable 错误重试。
 * 重试耗尽后抛出最后一次的 LlmCallError（携带 trace）。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const appError = error instanceof AppError ? error : classifyError(error);
      if (!appError.retryable || attempt === maxRetries) break;
      await delay(DEFAULT_RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  throw lastError;
}

/** 给请求挂上超时信号；不修改调用方原有的 signal */
function withTimeout(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
  onTimeout: Promise<never>;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new AppError("TIMEOUT", `LLM 调用超时（超过 ${timeoutMs}ms 未返回）`, {
        // 超时不重试：挂起通常是网络层问题，重试只会把单步时长放大到 超时×重试次数。
        retryable: false,
      }),
    );
  }, timeoutMs);

  const onTimeout = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(
        controller.signal.reason instanceof AppError
          ? controller.signal.reason
          : new AppError("TIMEOUT", "LLM 调用超时", { retryable: false }),
      );
    });
  });
  // 防止未被 await 时产生 unhandled rejection
  void onTimeout.catch(() => undefined);

  return {
    signal: controller.signal,
    onTimeout,
    clear: () => {
      clearTimeout(timer);
    },
  };
}

function traceContextOf(
  cfg: ModelConfig,
  agent: string,
  node: string,
  overrides: Partial<TraceContext> = {},
): TraceContext {
  return {
    agent,
    node,
    provider: cfg.provider,
    model: cfg.modelId,
    ...overrides,
  };
}

export interface GenerateOutcome {
  text: string;
  usage: LlmUsage;
  trace: TraceRecord;
}

/**
 * 超时中断不会经过 withTrace，这里补上带 trace 的错误，
 * 保证「每次 LLM 调用都有 trace」。
 */
function wrapTimeout(error: unknown, ctx: TraceContext, timeoutMs: number): unknown {
  if (
    error instanceof AppError &&
    error.code === "TIMEOUT" &&
    !(error instanceof LlmCallError)
  ) {
    return new LlmCallError(error, buildTimeoutTrace(ctx, timeoutMs));
  }
  return error;
}

/** 非流式文本生成 */
export async function generate(
  cfg: ModelConfig,
  request: LlmRequest,
  options: CallOptions & { agent?: string; node?: string } = {},
): Promise<GenerateOutcome> {
  const client = options.client ?? aiSdkClient;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctx = traceContextOf(cfg, options.agent ?? "unknown", options.node ?? "draft");

  return withRetry(async () => {
    const timeout = withTimeout(timeoutMs);
    try {
      const outcome = await Promise.race([
        withTrace(ctx, async () => {
          const result = await client.generate(cfg, {
            ...request,
            abortSignal: request.abortSignal ?? timeout.signal,
          });
          return { value: result.text, usage: result.usage };
        }),
        timeout.onTimeout,
      ]);
      return { text: outcome.value, usage: outcome.usage, trace: outcome.trace };
    } catch (error) {
      // 若失败由我们的超时控制器触发（即使底层先抛了 AbortError），统一为不可重试的 TIMEOUT，
      // 避免被 classifyError 当成「用户取消」而重试，导致单步时长被放大。
      if (timeout.signal.aborted && timeout.signal.reason instanceof AppError) {
        throw wrapTimeout(timeout.signal.reason, ctx, timeoutMs);
      }
      throw wrapTimeout(error, ctx, timeoutMs);
    } finally {
      timeout.clear();
    }
  }, maxRetries);
}

export interface StreamHandle {
  /** 真实的模型输出流，逐 chunk 产出 */
  textStream: AsyncIterable<string>;
  /** 流正常结束后 resolve，携带 usage 与 trace */
  finished: Promise<{ usage: LlmUsage; trace: TraceRecord }>;
  /** 主动取消（用于客户端断连 / 用户暂停） */
  abort: (reason?: string) => void;
}

/**
 * 流式文本生成。
 * 说明：流式调用不做整体重试（无法在半途安全重放），
 * 首 chunk 之前的失败由上层决定是否重跑。
 */
export function stream(
  cfg: ModelConfig,
  request: LlmRequest,
  options: CallOptions & { agent?: string; node?: string } = {},
): StreamHandle {
  const client = options.client ?? aiSdkClient;
  const ctx = traceContextOf(cfg, options.agent ?? "unknown", options.node ?? "draft");
  const controller = new AbortController();

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // 调用方取消时同步到内部 controller
  request.abortSignal?.addEventListener("abort", () => {
    controller.abort(request.abortSignal?.reason);
  });

  const result = client.stream(cfg, { ...request, abortSignal: controller.signal });

  let resolveFinished: (value: { usage: LlmUsage; trace: TraceRecord }) => void =
    () => undefined;
  let rejectFinished: (reason: unknown) => void = () => undefined;
  const finished = new Promise<{ usage: LlmUsage; trace: TraceRecord }>(
    (resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    },
  );
  // 标记已处理，避免未 await 时产生 unhandled rejection
  void finished.catch(() => undefined);

  async function* wrappedStream(): AsyncIterable<string> {
    try {
      for await (const chunk of result.textStream) {
        yield chunk;
      }
      const usage = await result.usage;
      const latencyMs = Date.now() - startMs;
      const doneAt = new Date().toISOString();
      const trace: TraceRecord = {
        id: createId(),
        agent: ctx.agent,
        node: ctx.node,
        provider: ctx.provider,
        model: ctx.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs,
        status: "ok",
        startedAt,
        finishedAt: doneAt,
      };
      resolveFinished({ usage, trace });
    } catch (error) {
      const appError =
        error instanceof LlmCallError ? error : classifyError(error);
      const latencyMs = Date.now() - startMs;
      const doneAt = new Date().toISOString();
      const trace: TraceRecord = {
        id: createId(),
        agent: ctx.agent,
        node: ctx.node,
        provider: ctx.provider,
        model: ctx.model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        status: "error",
        startedAt,
        finishedAt: doneAt,
        error: { code: appError.code, message: appError.message },
      };
      rejectFinished(new LlmCallError(appError, trace));
      throw new LlmCallError(appError, trace);
    }
  }

  return {
    textStream: wrappedStream(),
    finished,
    abort: (reason?: string) => {
      controller.abort(reason ?? "aborted by caller");
    },
  };
}

export interface StructuredOutcome<T> {
  object: T;
  usage: LlmUsage;
  trace: TraceRecord;
}

/** 结构化输出（generateObject + Zod schema） */
export async function structuredOutput<T>(
  cfg: ModelConfig,
  request: LlmStructuredRequest<T>,
  options: CallOptions & { agent?: string; node?: string } = {},
): Promise<StructuredOutcome<T>> {
  const client = options.client ?? aiSdkClient;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctx = traceContextOf(cfg, options.agent ?? "unknown", options.node ?? "draft");

  return withRetry(async () => {
    const timeout = withTimeout(timeoutMs);
    try {
      const outcome = await Promise.race([
        withTrace(ctx, async () => {
          const result = await client.structured<T>(cfg, {
            ...request,
            abortSignal: request.abortSignal ?? timeout.signal,
          });
          return { value: result.object, usage: result.usage };
        }),
        timeout.onTimeout,
      ]);
      return {
        object: outcome.value,
        usage: outcome.usage,
        trace: outcome.trace,
      };
    } catch (error) {
      // 若失败由我们的超时控制器触发（即使底层先抛了 AbortError），统一为不可重试的 TIMEOUT，
      // 避免被 classifyError 当成「用户取消」而重试，导致单步时长被放大。
      if (timeout.signal.aborted && timeout.signal.reason instanceof AppError) {
        throw wrapTimeout(timeout.signal.reason, ctx, timeoutMs);
      }
      throw wrapTimeout(error, ctx, timeoutMs);
    } finally {
      timeout.clear();
    }
  }, maxRetries);
}
