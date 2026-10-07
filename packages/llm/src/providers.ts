// @spec docs/ARCHITECTURE.md / docs/TECH-STACK.md §2
// Provider 解析。所有 Provider 适配都基于 Vercel AI SDK，禁止自写 HTTP 客户端。
//
// 注意：Provider 预设目录（PROVIDER_PRESETS / findPreset）已迁至 ./presets.ts，
// 以便浏览器侧安全引用而不引入 AI SDK。本文件只负责运行时模型解析。

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AppError } from "@aiclassroom/types";
import type { LanguageModel } from "ai";

/** 适配器维度：5 个适配器覆盖讲义列出的 11 家 Provider */
export const PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openai-compatible",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ModelConfig {
  provider: ProviderId;
  modelId: string;
  /** openai-compatible 必填；也可用于覆盖其他 Provider 的默认 baseURL */
  baseURL?: string;
  /** 浏览器本地 Key（Browser Key）。不传则回落到服务端环境变量。 */
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

/**
 * 解析 API Key：
 * 1) 优先使用请求内联的 Browser Key（cfg.apiKey）；
 * 2) 回落到服务端环境变量（envNames，对应 .env.local / 进程环境）；
 * 3) 二者皆无 → 抛出 PROVIDER_ERROR（不可重试）。
 * 不修改 Agent / Runtime，也不引入任何 Provider 特例。
 */
function resolveApiKey(
  key: string | undefined,
  provider: ProviderId,
  envNames: string[],
): string {
  if (key !== undefined && key !== "") return key;
  for (const name of envNames) {
    const fromEnv = env(name);
    if (fromEnv !== undefined) return fromEnv;
  }
  throw new AppError(
    "PROVIDER_ERROR",
    `未配置 ${provider} 的 API Key。请在服务端环境变量（${envNames.join(" / ")}）或产品「设置」中填写。`,
    { retryable: false },
  );
}

/**
 * 解析出 AI SDK 的 LanguageModel。
 * 无可用 Key 时抛出 PROVIDER_ERROR（不可重试，需要用户改配置）。
 */
export function resolveModel(cfg: ModelConfig): LanguageModel {
  switch (cfg.provider) {
    case "openai":
      return createOpenAI({
        apiKey: resolveApiKey(cfg.apiKey, "openai", ["OPENAI_API_KEY"]),
        baseURL: cfg.baseURL,
      }).chat(cfg.modelId);

    case "anthropic":
      return createAnthropic({
        apiKey: resolveApiKey(cfg.apiKey, "anthropic", ["ANTHROPIC_API_KEY"]),
        baseURL: cfg.baseURL,
      })(cfg.modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey: resolveApiKey(cfg.apiKey, "google", [
          "GOOGLE_GENERATIVE_AI_API_KEY",
        ]),
        baseURL: cfg.baseURL,
      })(cfg.modelId);

    case "deepseek":
      return createDeepSeek({
        apiKey: resolveApiKey(cfg.apiKey, "deepseek", ["DEEPSEEK_API_KEY"]),
        baseURL: cfg.baseURL,
      })(cfg.modelId);

    case "openai-compatible": {
      const apiKey = resolveApiKey(cfg.apiKey, "openai-compatible", [
        "OPENAI_COMPATIBLE_API_KEY",
      ]);
      const baseURL = cfg.baseURL ?? env("OPENAI_COMPATIBLE_BASE_URL");
      if (!baseURL) {
        throw new AppError(
          "PROVIDER_ERROR",
          "openai-compatible 需要 baseURL。请在请求中提供，或配置环境变量 OPENAI_COMPATIBLE_BASE_URL。",
          { retryable: false },
        );
      }
      return createOpenAICompatible({
        name: "openai-compatible",
        apiKey,
        baseURL,
      })(cfg.modelId);
    }

    default: {
      const _exhaustive: never = cfg.provider;
      throw new AppError("PROVIDER_ERROR", `未知 Provider：${String(_exhaustive)}`, {
        retryable: false,
      });
    }
  }
}

/** 该 Provider 当前是否有可用 Key（仅用于 UI 提示，不泄漏 Key 本身） */
export function hasConfiguredKey(
  cfg: Pick<ModelConfig, "provider" | "apiKey" | "baseURL">,
): boolean {
  const inline = cfg.apiKey !== undefined && cfg.apiKey !== "";
  switch (cfg.provider) {
    case "openai":
      return inline || env("OPENAI_API_KEY") !== undefined;
    case "anthropic":
      return inline || env("ANTHROPIC_API_KEY") !== undefined;
    case "google":
      return inline || env("GOOGLE_GENERATIVE_AI_API_KEY") !== undefined;
    case "deepseek":
      return inline || env("DEEPSEEK_API_KEY") !== undefined;
    case "openai-compatible":
      return (
        (inline || env("OPENAI_COMPATIBLE_API_KEY") !== undefined) &&
        (cfg.baseURL !== undefined || env("OPENAI_COMPATIBLE_BASE_URL") !== undefined)
      );
    default:
      return false;
  }
}
