// @spec docs/AGENT-ARCHITECTURE.md §2
//
// 显式节点流水线 runner。
//
// 【PROJECT DECISION D-01】讲义要求用 LangGraph 做编排，本项目采用自研显式节点流水线：
//   - 节点语义与 LangGraph node 1:1 对应（retrieve / plan / draft / validate / critique / finalize）
//   - 每个节点是纯函数（state, ctx）=> state，可独立单测
//   - 避免 LangGraph 的 LangChain ChatModel 假设与 Vercel AI SDK 双模型体系并存的适配成本
// 后续若需 checkpoint / 循环图，节点可平移到 LangGraph。

import { AppError, ValidationError } from "@aiclassroom/types";
import type { TraceRecord } from "@aiclassroom/types";

/**
 * 流水线节点内的校验失败。
 * 保留结构化 issues（而非只留一句 message），让 UI 能精确标红出错字段。
 */
export class PipelineValidationError extends ValidationError {
  readonly agent: string;
  readonly node: PipelineNodeName;

  constructor(
    agent: string,
    node: PipelineNodeName,
    issues: ValidationError["issues"],
  ) {
    super(issues);
    this.name = "PipelineValidationError";
    this.agent = agent;
    this.node = node;
  }
}

export const PIPELINE_NODES = [
  "retrieve",
  "plan",
  "draft",
  "validate",
  "critique",
  "finalize",
] as const;

export type PipelineNodeName = (typeof PIPELINE_NODES)[number];

export type PipelineEvent =
  | { type: "node_start"; agent: string; node: PipelineNodeName }
  | {
      type: "node_finish";
      agent: string;
      node: PipelineNodeName;
      durationMs: number;
    }
  | {
      type: "message";
      agent: string;
      node: PipelineNodeName;
      message: string;
    };

export interface PipelineContext {
  readonly agent: string;
  readonly signal: AbortSignal | undefined;
  /** 本次流水线累积的 LLM 调用 trace */
  readonly traces: TraceRecord[];
  emit(node: PipelineNodeName, message: string): void;
}

export interface PipelineStep<S> {
  node: PipelineNodeName;
  run(state: S, ctx: PipelineContext): Promise<S>;
}

export interface PipelineOptions<S> {
  agent: string;
  steps: readonly PipelineStep<S>[];
  initial: S;
  signal?: AbortSignal | undefined;
  onEvent?: ((event: PipelineEvent) => void) | undefined;
}

export interface PipelineResult<S> {
  state: S;
  traces: TraceRecord[];
  events: PipelineEvent[];
}

/**
 * 带「重跑」能力的流水线：
 * VALIDATION / 自检类可重试错误发生时，整条流水线重跑（最多 maxRepairs 次），
 * 对应 docs/AGENT-ARCHITECTURE.md §6 的「校验失败 → 重跑 Draft」。
 * 每一次尝试的 trace 都会保留，便于定位问题。
 */
export async function runPipelineWithRepair<S>(
  options: PipelineOptions<S> & { maxRepairs?: number },
): Promise<PipelineResult<S>> {
  const maxRepairs = options.maxRepairs ?? 1;
  const allTraces: TraceRecord[] = [];
  const allEvents: PipelineEvent[] = [];
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    try {
      const result = await runPipeline({
        agent: options.agent,
        steps: options.steps,
        initial: options.initial,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onEvent: (event) => {
          allEvents.push(event);
          options.onEvent?.(event);
        },
      });
      // runPipeline 内部已有 traces 数组，这里把历史尝试的 trace 合并到前面
      return {
        state: result.state,
        traces: [...allTraces, ...result.traces],
        events: allEvents,
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AppError ? error.retryable : false;
      if (!retryable || attempt === maxRepairs) break;
      allEvents.push({
        type: "message",
        agent: options.agent,
        node: "draft",
        message: `第 ${attempt + 1} 次尝试失败，重跑草稿…`,
      });
    }
  }

  throw lastError;
}

export async function runPipeline<S>(
  options: PipelineOptions<S>,
): Promise<PipelineResult<S>> {
  const events: PipelineEvent[] = [];
  const traces: TraceRecord[] = [];

  const emit = (event: PipelineEvent): void => {
    events.push(event);
    options.onEvent?.(event);
  };

  const ctx: PipelineContext = {
    agent: options.agent,
    signal: options.signal,
    traces,
    emit: (node, message) =>
      emit({ type: "message", agent: options.agent, node, message }),
  };

  let state = options.initial;

  for (const step of options.steps) {
    const startedAt = Date.now();
    emit({ type: "node_start", agent: options.agent, node: step.node });
    try {
      state = await step.run(state, ctx);
    } catch (error) {
      // 校验失败保留结构化 issues，不被降级成一句 message
      if (error instanceof ValidationError) {
        throw new PipelineValidationError(
          options.agent,
          step.node,
          error.issues,
        );
      }
      const appError =
        error instanceof AppError
          ? error
          : new AppError("GENERATION_ERROR", String((error as Error)?.message ?? error), {
              retryable: false,
              cause: error,
            });
      throw new AppError(
        appError.code,
        `[${options.agent}/${step.node}] ${appError.message}`,
        { retryable: appError.retryable, cause: error },
      );
    }
    emit({
      type: "node_finish",
      agent: options.agent,
      node: step.node,
      durationMs: Date.now() - startedAt,
    });
  }

  return { state, traces, events };
}
