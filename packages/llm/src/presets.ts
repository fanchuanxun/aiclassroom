// @spec docs/ARCHITECTURE.md / docs/TECH-STACK.md §2
// 轻量 Provider 预设目录 + 用户自定义 Provider 配置模型。
//
// 设计约束（非常重要）：本文件禁止 import 任何 AI SDK（@ai-sdk/* / ai）。
// 这样它可以被浏览器侧安全引用（用于「设置」页的下拉清单与配置映射），
// 而绝不会把整套 Provider SDK 打进客户端包。
// 运行时的模型解析仍由 providers.ts 的 resolveModel / resolveApiKey 负责。

import type { ModelConfig, ProviderId } from "./providers";

export interface ProviderModelDef {
  id: string;
  name: string;
  capabilities?: string[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  subtitle: string;
  /** 对应 @aiclassroom/llm 的 ProviderId（5 个适配器维度之一） */
  adapter: ProviderId;
  /** openai-compatible 的默认 baseURL */
  defaultBaseUrl?: string;
  models: ProviderModelDef[];
}

/**
 * 讲义列出的 11 家 Provider。
 * 只有 4 家有独立适配器，其余走 OpenAI 协议兼容（PD-02）。
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "OpenAI 协议",
    adapter: "openai",
    models: [
      { id: "gpt-4o", name: "GPT-4o", capabilities: ["chat", "vision"] },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", capabilities: ["chat", "vision"] },
    ],
  },
  {
    id: "anthropic",
    name: "Claude",
    subtitle: "Anthropic 协议",
    adapter: "anthropic",
    models: [
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        capabilities: ["chat", "vision"],
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        capabilities: ["chat", "vision"],
      },
    ],
  },
  {
    id: "google",
    name: "Gemini",
    subtitle: "Google 协议",
    adapter: "google",
    models: [
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        capabilities: ["chat", "vision"],
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    subtitle: "DeepSeek 协议",
    adapter: "deepseek",
    models: [{ id: "deepseek-chat", name: "DeepSeek Chat", capabilities: ["chat"] }],
  },
  {
    id: "glm",
    name: "GLM",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [{ id: "glm-4.6", name: "GLM-4.6", capabilities: ["chat"] }],
  },
  {
    id: "qwen",
    name: "通义千问 / 百炼",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [{ id: "qwen-max", name: "Qwen Max", capabilities: ["chat"] }],
  },
  {
    id: "kimi",
    name: "Kimi",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    models: [{ id: "moonshot-v1-128k", name: "Moonshot v1 128K", capabilities: ["chat"] }],
  },
  {
    id: "minimax",
    name: "MiniMax",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    models: [{ id: "MiniMax-Text-01", name: "MiniMax-Text-01", capabilities: ["chat"] }],
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    models: [
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5-72B", capabilities: ["chat"] },
    ],
  },
  {
    id: "doubao",
    name: "豆包",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [{ id: "doubao-pro-32k", name: "Doubao Pro 32K", capabilities: ["chat"] }],
  },
  {
    id: "grok",
    name: "Grok",
    subtitle: "OpenAI 协议",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [{ id: "grok-3", name: "Grok 3", capabilities: ["chat"] }],
  },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** 自定义 OpenAI Compatible Provider 的固定 providerId。 */
export const CUSTOM_PROVIDER_ID = "custom";

/**
 * 用户自定义 Provider 配置（适配 packages/llm 的 ModelConfig / ProviderId）。
 * 在用户给定的最小结构 { providerId, name, apiKey, baseUrl?, model, enabled }
 * 基础上，补充存储所需的 id / adapter / timestamps，避免与 packages/llm 冲突。
 *
 * 安全：apiKey 仅驻留浏览器 IndexedDB（Dexie），绝不进 localStorage、Lesson、
 * corpus、trace、log、URL 或页面文本。
 */
export interface UserProviderConfig {
  /** 存储主键（uuid），用于多 Provider 管理 */
  id: string;
  /** 内置预设 id（openai / qwen / deepseek ...）或 CUSTOM_PROVIDER_ID */
  providerId: string;
  /** 展示名（如「我的中转 API」） */
  name: string;
  /** 解析用的适配器维度（openai / anthropic / google / deepseek / openai-compatible） */
  adapter: ProviderId;
  apiKey: string;
  /** openai-compatible 必填；内置预设可留空使用 defaultBaseUrl */
  baseUrl?: string;
  model: string;
  /** 是否为当前使用（同一时刻至多一个为 true） */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 把用户配置映射为服务端 ModelConfig（复用 resolveModel / resolveApiKey 的语义） */
export function userProviderToModelConfig(c: UserProviderConfig): ModelConfig {
  const preset = findPreset(c.providerId);
  const adapter = preset?.adapter ?? c.adapter ?? "openai-compatible";
  const defaultBaseUrl = preset?.defaultBaseUrl;
  return {
    provider: adapter,
    modelId: c.model,
    ...(c.baseUrl || defaultBaseUrl ? { baseURL: c.baseUrl || defaultBaseUrl } : {}),
    ...(c.apiKey ? { apiKey: c.apiKey } : {}),
  };
}

export interface ProviderValidationIssue {
  field: "name" | "apiKey" | "baseUrl" | "model";
  message: string;
  /** error = 硬拒绝（无法保存）；warning = 允许保存但生成/测试需服务端 Key */
  level: "error" | "warning";
}

/**
 * 校验用户 Provider 表单（纯函数，无副作用，可在浏览器与服务端复用）。
 * - model 为空：硬错误（无法生成）
 * - baseUrl 非空但非法（非 http/https）：硬错误
 * - apiKey 为空：warning（允许保存，生成/测试将回落到服务端环境变量；
 *   若服务端也未配置则会在 resolveApiKey 阶段抛出 PROVIDER_ERROR）
 * - requireBaseUrl=true（自定义 OpenAI Compatible）：baseUrl 必填且必须合法
 */
export function validateUserProviderConfig(
  c: {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  },
  opts?: { requireBaseUrl?: boolean },
): ProviderValidationIssue[] {
  const issues: ProviderValidationIssue[] = [];

  if (!c.model || c.model.trim() === "") {
    issues.push({ field: "model", level: "error", message: "模型不能为空" });
  }

  const hasBaseUrl = c.baseUrl !== undefined && c.baseUrl.trim() !== "";
  if (opts?.requireBaseUrl && !hasBaseUrl) {
    issues.push({
      field: "baseUrl",
      level: "error",
      message: "自定义 OpenAI Compatible 必须填写 Base URL",
    });
  } else if (hasBaseUrl) {
    const isValidUrl = (() => {
      try {
        const u = new URL(c.baseUrl!.trim());
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    })();
    if (!isValidUrl) {
      issues.push({
        field: "baseUrl",
        level: "error",
        message: "Base URL 必须是合法的 http/https 地址",
      });
    }
  }

  if (!c.apiKey || c.apiKey.trim() === "") {
    issues.push({
      field: "apiKey",
      level: "warning",
      message: "未填写 API Key，将尝试使用服务端环境变量；若服务端也未配置则会失败",
    });
  }

  return issues;
}
