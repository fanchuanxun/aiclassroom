// @spec docs/TRACE.md
// Trace 采集的唯一入口。绝不记录 API Key / Authorization header / 任何 Secret。

import { AppError, createId } from "@aiclassroom/types";
import type { TraceRecord, TraceStatus } from "@aiclassroom/types";
import { classifyError } from "./errors";
import type { LlmUsage } from "./types";

export interface TraceContext {
  /** outline_agent / scene_agent / action_agent ... */
  agent: string;
  /** 流水线节点名：retrieve / plan / draft / validate / critique / finalize */
  node: string;
  provider: string;
  model: string;
  lessonId?: string | undefined;
  sceneId?: string | undefined;
}

/** 带 trace 的 LLM 调用错误：UI 可据此展示「发生了什么 / 能否重试 / 如何恢复」 */
export class LlmCallError extends AppError {
  readonly trace: TraceRecord;

  constructor(error: AppError, trace: TraceRecord) {
    super(error.code, error.message, {
      retryable: error.retryable,
      ...(error.traceId === undefined ? {} : { traceId: error.traceId }),
      cause: error.cause,
    });
    this.name = "LlmCallError";
    this.trace = trace;
  }
}

function makeTrace(input: {
  ctx: TraceContext;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  usage: LlmUsage;
  status: TraceStatus;
  error?: { code: string; message: string; stack?: string };
}): TraceRecord {
  return {
    id: createId(),
    ...(input.ctx.lessonId === undefined ? {} : { lessonId: input.ctx.lessonId }),
    ...(input.ctx.sceneId === undefined ? {} : { sceneId: input.ctx.sceneId }),
    agent: input.ctx.agent,
    node: input.ctx.node,
    provider: input.ctx.provider,
    model: input.ctx.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    latencyMs: input.latencyMs,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    ...(input.error === undefined ? {} : { error: input.error }),
  };
}

/**
 * 超时场景的 trace：即使请求被中断，也必须留下可追溯记录。
 */
export function buildTimeoutTrace(
  ctx: TraceContext,
  timeoutMs: number,
): TraceRecord {
  const startedAt = new Date(Date.now() - timeoutMs).toISOString();
  const finishedAt = new Date().toISOString();
  return makeTrace({
    ctx,
    startedAt,
    finishedAt,
    latencyMs: timeoutMs,
    usage: { inputTokens: 0, outputTokens: 0 },
    status: "error",
    error: {
      code: "TIMEOUT",
      message: `LLM 调用超时（超过 ${timeoutMs}ms 未返回）`,
    },
  });
}

export type TracedOutcome<T> = {
  value: T;
  usage: LlmUsage;
  trace: TraceRecord;
};

/**
 * 包裹一次 LLM 调用，产出 TraceRecord。
 * 成功返回 { value, usage, trace }；失败抛出 LlmCallError（携带 trace）。
 */
export async function withTrace<T>(
  ctx: TraceContext,
  fn: () => Promise<{ value: T; usage: LlmUsage }>,
): Promise<TracedOutcome<T>> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    const { value, usage } = await fn();
    const finishedAt = new Date().toISOString();
    return {
      value,
      usage,
      trace: makeTrace({
        ctx,
        startedAt,
        finishedAt,
        latencyMs: Date.now() - startMs,
        usage,
        status: "ok",
      }),
    };
  } catch (error) {
    const appError = classifyError(error);
    const finishedAt = new Date().toISOString();
    const trace = makeTrace({
      ctx,
      startedAt,
      finishedAt,
      latencyMs: Date.now() - startMs,
      usage: { inputTokens: 0, outputTokens: 0 },
      status: "error",
      error: { code: appError.code, message: appError.message },
    });
    throw new LlmCallError(appError, trace);
  }
}
