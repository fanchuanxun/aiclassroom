// @spec docs/TESTING.md (Provider Config 数据模型测试)
import { describe, it, expect, beforeEach } from "vitest";
import type { UserProviderConfig } from "./presets";
import {
  PROVIDER_PRESETS,
  findPreset,
  CUSTOM_PROVIDER_ID,
  userProviderToModelConfig,
  validateUserProviderConfig,
} from "./presets";
import { resolveModel } from "./providers";
import { AppError } from "@aiclassroom/types";

function cfg(over: Partial<UserProviderConfig> = {}): UserProviderConfig {
  return {
    id: "p1",
    providerId: "qwen",
    name: "百炼",
    adapter: "openai-compatible",
    apiKey: "sk-test-123",
    model: "qwen-max",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("presets / UserProviderConfig 数据模型", () => {
  it("PROVIDER_PRESETS 覆盖讲义 11 家 Provider", () => {
    expect(PROVIDER_PRESETS).toHaveLength(11);
    expect(PROVIDER_PRESETS.map((p) => p.id)).toContain("qwen");
    expect(PROVIDER_PRESETS.map((p) => p.id)).toContain("deepseek");
    expect(PROVIDER_PRESETS.map((p) => p.id)).toContain("openai");
  });

  it("findPreset 能查到内置 Provider", () => {
    expect(findPreset("qwen")?.adapter).toBe("openai-compatible");
    expect(findPreset("nope")).toBeUndefined();
  });

  it("内置 Provider 映射为正确的 ModelConfig（adapter + 默认 baseURL + key）", () => {
    const m = userProviderToModelConfig(cfg());
    expect(m.provider).toBe("openai-compatible");
    expect(m.modelId).toBe("qwen-max");
    expect(m.baseURL).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(m.apiKey).toBe("sk-test-123");
  });

  it("openai 预设映射到 openai 适配器", () => {
    const m = userProviderToModelConfig(cfg({ providerId: "openai", model: "gpt-4o" }));
    expect(m.provider).toBe("openai");
    expect(m.modelId).toBe("gpt-4o");
  });

  it("自定义 OpenAI Compatible 使用用户填写的 baseURL", () => {
    const m = userProviderToModelConfig(
      cfg({
        providerId: CUSTOM_PROVIDER_ID,
        adapter: "openai-compatible",
        baseUrl: "https://my-proxy.example.com/v1",
        model: "deepseek-chat",
      }),
    );
    expect(m.provider).toBe("openai-compatible");
    expect(m.baseURL).toBe("https://my-proxy.example.com/v1");
    expect(m.modelId).toBe("deepseek-chat");
  });

  it("内置预设未填 key 时回落到服务端环境变量（不把空串塞进 ModelConfig）", () => {
    const m = userProviderToModelConfig(cfg({ apiKey: "" }));
    expect(m.apiKey).toBeUndefined();
  });
});

describe("validateUserProviderConfig 校验", () => {
  it("空 model → 硬错误", () => {
    const issues = validateUserProviderConfig({ model: "" });
    expect(issues.some((i) => i.field === "model" && i.level === "error")).toBe(true);
  });

  it("非法 baseUrl（ftp）→ 硬错误", () => {
    const issues = validateUserProviderConfig({ model: "m", baseUrl: "ftp://x" });
    expect(issues.some((i) => i.field === "baseUrl" && i.level === "error")).toBe(true);
  });

  it("合法 baseUrl（https）→ 通过", () => {
    const issues = validateUserProviderConfig({
      model: "m",
      baseUrl: "https://x.example.com/v1",
      apiKey: "sk-1",
    });
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("首尾带空格的合法 baseUrl 也能通过（保存前已统一 trim）", () => {
    const issues = validateUserProviderConfig(
      { model: "m", baseUrl: "  https://x.example.com/v1  ", apiKey: "sk-1" },
      { requireBaseUrl: true },
    );
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("自定义 requireBaseUrl 但 baseUrl 空 → 硬错误", () => {
    const issues = validateUserProviderConfig({ model: "m" }, { requireBaseUrl: true });
    expect(
      issues.some((i) => i.field === "baseUrl" && i.level === "error"),
    ).toBe(true);
  });

  it("空 apiKey → 仅 warning（允许保存，生成时回落服务端）", () => {
    const issues = validateUserProviderConfig({ model: "m", baseUrl: "https://x/v1" });
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(issues.some((i) => i.field === "apiKey" && i.level === "warning")).toBe(true);
  });
});

describe("resolveApiKey 边界：空 Key 且无服务端变量 → 清晰 PROVIDER_ERROR", () => {
  beforeEach(() => {
    // 确保测试环境没有服务端 Key，模拟「用户没填且服务端也没配」
    delete process.env.OPENAI_COMPATIBLE_API_KEY;
  });

  it("openai-compatible 无 Key 时抛出 PROVIDER_ERROR", () => {
    let thrown: unknown;
    try {
      resolveModel({ provider: "openai-compatible", modelId: "x" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("PROVIDER_ERROR");
  });
});
