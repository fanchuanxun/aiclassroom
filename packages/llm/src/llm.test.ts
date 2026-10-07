// @spec docs/TESTING.md
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@aiclassroom/types";
import {
  DEFAULT_MAX_RETRIES,
  generate,
  structuredOutput,
  stream,
} from "./llm";
import { LlmCallError, withTrace } from "./trace";
import { classifyError, sanitizeMessage, toErrorPayload } from "./errors";
import { normalizeUsage } from "./client";
import {
  PROVIDER_IDS,
  hasConfiguredKey,
  resolveModel,
} from "./providers";
import { PROVIDER_PRESETS } from "./presets";
import { createMockLlmClient } from "./testing/mock-client";
import type { LlmClient, LlmUsage } from "./types";
import type { ModelConfig } from "./providers";

const cfg: ModelConfig = { provider: "openai", modelId: "gpt-4o-mini" };
const ZERO: LlmUsage = { inputTokens: 0, outputTokens: 0 };

describe("sanitizeMessage", () => {
  it("抹掉 sk- 形态的密钥", () => {
    const out = sanitizeMessage("请求失败：invalid api key sk-abcdefgh12345678 已拒绝");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcdefgh12345678");
  });

  it("抹掉 Bearer token", () => {
    const out = sanitizeMessage("Authorization: Bearer abcdefgh12345678xyz");
    expect(out).toContain("Bearer [REDACTED]");
  });
});

describe("classifyError", () => {
  it("AppError 原样透传", () => {
    const original = new AppError("NETWORK_ERROR", "x", { retryable: true });
    expect(classifyError(original)).toBe(original);
  });

  it("401 归为 PROVIDER_ERROR 且不可重试", () => {
    const err = Object.assign(new Error("Incorrect API key provided"), {
      statusCode: 401,
    });
    const classified = classifyError(err);
    expect(classified.code).toBe("PROVIDER_ERROR");
    expect(classified.retryable).toBe(false);
  });

  it("超时归为 TIMEOUT 且可重试", () => {
    const classified = classifyError(new Error("request timed out"));
    expect(classified.code).toBe("TIMEOUT");
    expect(classified.retryable).toBe(true);
  });

  it("网络异常归为 NETWORK_ERROR 且可重试", () => {
    const classified = classifyError(new Error("fetch failed ECONNREFUSED"));
    expect(classified.code).toBe("NETWORK_ERROR");
    expect(classified.retryable).toBe(true);
  });

  it("5xx 可重试，4xx 不可重试", () => {
    expect(
      classifyError(Object.assign(new Error("boom"), { statusCode: 500 })).retryable,
    ).toBe(true);
    expect(
      classifyError(Object.assign(new Error("bad"), { statusCode: 400 })).retryable,
    ).toBe(false);
  });

  it("toErrorPayload 不含密钥", () => {
    const payload = toErrorPayload(new Error("bad sk-abcdefgh12345678"));
    expect(payload.message).not.toContain("sk-abcdefgh12345678");
    expect(payload.code).toBe("LLM_ERROR");
  });
});

describe("providers", () => {
  it("5 个适配器覆盖讲义 11 家 Provider", () => {
    expect(PROVIDER_IDS).toHaveLength(5);
    expect(PROVIDER_PRESETS).toHaveLength(11);
  });

  it("openai-compatible 缺少 baseURL 时抛 PROVIDER_ERROR", () => {
    const saved = process.env["OPENAI_COMPATIBLE_BASE_URL"];
    delete process.env["OPENAI_COMPATIBLE_BASE_URL"];
    try {
      expect(() =>
        resolveModel({ provider: "openai-compatible", modelId: "m", apiKey: "k" }),
      ).toThrow(/baseURL/);
    } finally {
      if (saved !== undefined) process.env["OPENAI_COMPATIBLE_BASE_URL"] = saved;
    }
  });

  it("无 Key 时 hasConfiguredKey 为 false，有 Key 时为 true", () => {
    const saved = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    try {
      expect(hasConfiguredKey({ provider: "openai" })).toBe(false);
      expect(hasConfiguredKey({ provider: "openai", apiKey: "k" })).toBe(true);
    } finally {
      if (saved !== undefined) process.env["OPENAI_API_KEY"] = saved;
    }
  });

  it("有 Key 时 resolveModel 能解析出模型对象", () => {
    const model = resolveModel({
      provider: "openai",
      modelId: "gpt-4o-mini",
      apiKey: "test-key",
    });
    expect(model).toBeDefined();
  });
});

describe("normalizeUsage", () => {
  it("缺失 usage 记 0，不编造", () => {
    expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: 3, outputTokens: 4 })).toEqual({
      inputTokens: 3,
      outputTokens: 4,
    });
  });
});

describe("withTrace", () => {
  const ctx = {
    agent: "outline_agent",
    node: "draft",
    provider: "openai",
    model: "gpt-4o-mini",
  };

  it("成功时产出 ok trace", async () => {
    const outcome = await withTrace(ctx, async () => ({
      value: "hi",
      usage: { inputTokens: 1, outputTokens: 2 },
    }));
    expect(outcome.value).toBe("hi");
    expect(outcome.trace.status).toBe("ok");
    expect(outcome.trace.agent).toBe("outline_agent");
    expect(outcome.trace.node).toBe("draft");
    expect(outcome.trace.inputTokens).toBe(1);
    expect(outcome.trace.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("失败时抛出 LlmCallError 且携带 error trace", async () => {
    let caught: unknown;
    try {
      await withTrace(ctx, async () => {
        throw new Error("boom");
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmCallError);
    const err = caught as LlmCallError;
    expect(err.trace.status).toBe("error");
    expect(err.trace.error?.message).toContain("boom");
  });

  it("trace 不包含任何密钥字段", async () => {
    const outcome = await withTrace(ctx, async () => ({
      value: 1,
      usage: ZERO,
    }));
    const serialized = JSON.stringify(outcome.trace);
    expect(serialized).not.toMatch(/sk-/);
    expect(serialized).not.toMatch(/apiKey/i);
    expect(serialized).not.toMatch(/Bearer/i);
  });
});

describe("generate / structuredOutput / stream（注入 mock client）", () => {
  it("generate 返回文本、usage 与 trace", async () => {
    const client = createMockLlmClient({
      text: "你好",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const result = await generate(
      cfg,
      { prompt: "hi" },
      { client, agent: "t", node: "draft" },
    );
    expect(result.text).toBe("你好");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.trace.status).toBe("ok");
    expect(client.calls[0]?.prompt).toBe("hi");
  });

  it("structuredOutput 返回对象", async () => {
    const schema = z.object({ title: z.string(), count: z.number() });
    const client = createMockLlmClient({
      objects: [{ title: "人工智能", count: 3 }],
    });
    const result = await structuredOutput(cfg, { prompt: "p", schema }, { client });
    expect(result.object.title).toBe("人工智能");
    expect(result.object.count).toBe(3);
    expect(result.trace.status).toBe("ok");
  });

  it("stream 逐块产出真实文本，结束后 resolve trace", async () => {
    const client = createMockLlmClient({
      chunks: ["你", "好", "，", "同学"],
      usage: { inputTokens: 2, outputTokens: 4 },
    });
    const handle = stream(cfg, { prompt: "p" }, { client });
    const received: string[] = [];
    for await (const chunk of handle.textStream) received.push(chunk);

    expect(received.join("")).toBe("你好，同学");
    const { usage, trace } = await handle.finished;
    expect(usage.outputTokens).toBe(4);
    expect(trace.status).toBe("ok");
  });

  it("stream 过程中出错时产出 error trace", async () => {
    const failing: LlmClient = {
      kind: "test-async-fail",
      generate: async () => ({ text: "", usage: ZERO }),
      stream: () => ({
        // eslint-disable-next-line require-yield
        textStream: (async function* () {
          throw new AppError("LLM_ERROR", "stream boom", { retryable: false });
        })(),
        usage: Promise.resolve(ZERO),
      }),
      structured: async <T>() => ({ object: {} as T, usage: ZERO }),
    };

    const handle = stream(cfg, { prompt: "p" }, { client: failing });
    let threw = false;
    try {
      for await (const _chunk of handle.textStream) void _chunk;
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    await expect(handle.finished).rejects.toBeInstanceOf(LlmCallError);
  });
});

describe("重试策略", () => {
  it("可重试错误会自动重试直到成功", async () => {
    const retryable = new AppError("NETWORK_ERROR", "fetch failed", {
      retryable: true,
    });
    const client = createMockLlmClient({ text: "ok", error: retryable, failTimes: 2 });
    const result = await generate(cfg, { prompt: "p" }, { client });
    expect(result.text).toBe("ok");
    expect(client.calls).toHaveLength(3);
  });

  it("不可重试错误不重试", async () => {
    const fatal = new AppError("PROVIDER_ERROR", "key 无效", { retryable: false });
    const client = createMockLlmClient({ text: "ok", error: fatal });
    let threw = false;
    try {
      await generate(cfg, { prompt: "p" }, { client });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(client.calls).toHaveLength(1);
  });

  it("重试耗尽后抛出携带 trace 的 LlmCallError", async () => {
    const retryable = new AppError("NETWORK_ERROR", "fetch failed", {
      retryable: true,
    });
    const client = createMockLlmClient({ error: retryable });
    let caught: unknown;
    try {
      await generate(cfg, { prompt: "p" }, { client });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmCallError);
    expect((caught as LlmCallError).trace.status).toBe("error");
    // 1 次初始 + DEFAULT_MAX_RETRIES 次重试
    expect(client.calls).toHaveLength(1 + DEFAULT_MAX_RETRIES);
  });
});

describe("超时", () => {
  it("超过 timeoutMs 时抛 TIMEOUT", async () => {
    const hanging = createMockLlmClient();
    hanging.generate = () => new Promise<never>(() => undefined);

    let caught: unknown;
    try {
      await generate(
        cfg,
        { prompt: "p" },
        { client: hanging, timeoutMs: 20, maxRetries: 0 },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmCallError);
    expect((caught as LlmCallError).code).toBe("TIMEOUT");
  });
});
