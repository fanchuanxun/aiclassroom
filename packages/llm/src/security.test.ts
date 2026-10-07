// @spec docs/API.md §5 / docs/SECURITY.md
// 安全测试：API Key 脱敏 + 错误映射为用户可读的 Provider Error。
import { describe, it, expect } from "vitest";
import { sanitizeMessage, classifyError, toErrorPayload } from "./errors";

function makeErr(status?: number, name?: string, message?: string): Error {
  const e = new Error(message ?? "boom") as Error & { statusCode?: number };
  if (name) Object.defineProperty(e, "name", { value: name });
  if (status !== undefined) e.statusCode = status;
  return e;
}

describe("sanitizeMessage 抹掉一切密钥形态", () => {
  it("抹掉 sk- / Bearer / api_key= 等形态", () => {
    const msg =
      "key sk-abcdef1234567890xyz leaked, Authorization: Bearer sk-secret-999, api_key=sk-000111";
    const out = sanitizeMessage(msg);
    expect(out).not.toContain("sk-abcdef");
    expect(out).not.toContain("sk-secret");
    expect(out).not.toContain("sk-000111");
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("Bearer [REDACTED]");
  });
});

describe("classifyError 把 HTTP / 网络异常映射为用户可读 Provider Error", () => {
  it("401 → PROVIDER_ERROR（不可重试）", () => {
    const a = classifyError(makeErr(401));
    expect(a.code).toBe("PROVIDER_ERROR");
    expect(a.retryable).toBe(false);
  });

  it("403 → PROVIDER_ERROR（不可重试）", () => {
    const a = classifyError(makeErr(403));
    expect(a.code).toBe("PROVIDER_ERROR");
    expect(a.retryable).toBe(false);
  });

  it("429 → 可重试", () => {
    const a = classifyError(makeErr(429));
    expect(a.code).toBe("LLM_ERROR");
    expect(a.retryable).toBe(true);
  });

  it("500 → 可重试", () => {
    const a = classifyError(makeErr(500));
    expect(a.retryable).toBe(true);
  });

  it("timeout 文本 → TIMEOUT", () => {
    const a = classifyError(makeErr(undefined, undefined, "Request timed out after 30s"));
    expect(a.code).toBe("TIMEOUT");
    expect(a.retryable).toBe(true);
  });

  it("网络异常 → NETWORK_ERROR（可重试）", () => {
    const a = classifyError(makeErr(undefined, "FetchError", "fetch failed ECONNREFUSED"));
    expect(a.code).toBe("NETWORK_ERROR");
    expect(a.retryable).toBe(true);
  });
});

describe("toErrorPayload 不泄漏 Key", () => {
  it("错误信息中的 Key 被脱敏", () => {
    const payload = toErrorPayload(makeErr(401, undefined, "Bad key sk-abcdef1234567890"));
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("sk-abcdef");
    expect(payload.code).toBe("PROVIDER_ERROR");
  });

  it("payload 不含任何 Authorization / apiKey 字段", () => {
    const payload = toErrorPayload(makeErr(500, undefined, "oops sk-abcdef1234567890"));
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("apikey");
  });
});
