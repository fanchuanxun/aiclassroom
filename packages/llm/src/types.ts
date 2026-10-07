// @spec docs/ARCHITECTURE.md
// LLM 抽象层类型。Agent 只依赖这些接口，不感知具体 Provider SDK。

import type { ZodType } from "zod";
import type { ModelConfig } from "./providers";

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export interface LlmRequest {
  prompt: string;
  system?: string | undefined;
  abortSignal?: AbortSignal | undefined;
}

export interface LlmStructuredRequest<T> extends LlmRequest {
  schema: ZodType<T>;
  schemaName?: string | undefined;
}

export interface LlmTextResult {
  text: string;
  usage: LlmUsage;
}

export interface LlmStreamResult {
  textStream: AsyncIterable<string>;
  usage: Promise<LlmUsage>;
}

export interface LlmStructuredResult<T> {
  object: T;
  usage: LlmUsage;
}

/**
 * LLM 客户端契约。
 * 生产实现 = aiSdkClient（Vercel AI SDK）；测试实现 = createMockLlmClient（TEST ONLY）。
 */
export interface LlmClient {
  readonly kind: string;
  generate(cfg: ModelConfig, request: LlmRequest): Promise<LlmTextResult>;
  stream(cfg: ModelConfig, request: LlmRequest): LlmStreamResult;
  structured<T>(
    cfg: ModelConfig,
    request: LlmStructuredRequest<T>,
  ): Promise<LlmStructuredResult<T>>;
}
