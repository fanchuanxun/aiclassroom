// MOCK — TEST ONLY
// 本文件只允许被 *.test.ts 引用。生产实现禁止 import 本文件。

import type {
  LlmClient,
  LlmRequest,
  LlmStreamResult,
  LlmStructuredRequest,
  LlmUsage,
} from "../types";

export interface MockLlmOptions {
  /** generate() 返回的文本 */
  text?: string;
  /** stream() 逐块产出的内容 */
  chunks?: string[];
  /** structured() 依次返回的对象；用完后回落到第一个 */
  objects?: unknown[];
  /** 若设置，所有调用抛出该错误 */
  error?: unknown;
  /** 若设置，前 failTimes 次调用抛出 error，之后正常返回 */
  failTimes?: number;
  usage?: LlmUsage;
}

export type MockCallKind = "generate" | "stream" | "structured";

export interface MockCall {
  kind: MockCallKind;
  prompt: string;
  system?: string;
}

export interface MockLlmClient extends LlmClient {
  readonly calls: MockCall[];
  reset(): void;
}

const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * 受控的假 LLM 客户端，用于 Agent / 流水线 / 重试逻辑测试。
 * 它替换的是「Provider 传输层」，不改变被测代码的任何分支逻辑。
 */
export function createMockLlmClient(options: MockLlmOptions = {}): MockLlmClient {
  const calls: MockCall[] = [];
  const chunks = options.chunks ?? (options.text === undefined ? [] : [options.text]);
  const usage = options.usage ?? ZERO_USAGE;
  let failRemaining = options.failTimes ?? (options.error === undefined ? 0 : -1);
  let objectCursor = 0;

  const maybeFail = (): void => {
    if (options.error === undefined) return;
    if (options.failTimes === undefined) {
      throw options.error;
    }
    if (failRemaining > 0) {
      failRemaining -= 1;
      throw options.error;
    }
  };

  const nextObject = (): unknown => {
    const list = options.objects ?? [];
    if (list.length === 0) return {};
    const item = list[objectCursor % list.length];
    objectCursor += 1;
    return item;
  };

  return {
    kind: "mock",
    calls,
    reset() {
      calls.length = 0;
      objectCursor = 0;
      failRemaining = options.failTimes ?? (options.error === undefined ? 0 : -1);
    },

    async generate(_cfg: never, request: LlmRequest) {
      calls.push({
        kind: "generate",
        prompt: request.prompt,
        ...(request.system === undefined ? {} : { system: request.system }),
      });
      maybeFail();
      return { text: options.text ?? "", usage };
    },

    stream(_cfg: never, request: LlmRequest): LlmStreamResult {
      calls.push({
        kind: "stream",
        prompt: request.prompt,
        ...(request.system === undefined ? {} : { system: request.system }),
      });
      maybeFail();
      return {
        textStream: (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
        usage: Promise.resolve(usage),
      };
    },

    async structured<T>(_cfg: never, request: LlmStructuredRequest<T>) {
      calls.push({
        kind: "structured",
        prompt: request.prompt,
        ...(request.system === undefined ? {} : { system: request.system }),
      });
      maybeFail();
      return { object: nextObject() as T, usage };
    },
  };
}
