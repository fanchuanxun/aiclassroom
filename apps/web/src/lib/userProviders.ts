// @spec docs/PLAN.md (Phase 1 用户自定义 Provider)
// 用户 Provider 配置的前端状态层：从 Dexie 加载 / 写入 / 切换，
// 并暴露「当前 Provider → ModelConfig」映射供生成链路使用。
//
// 关键安全约束：
// - API Key 仅存于浏览器 IndexedDB（Dexie 的 userProviders 表），绝不使用 localStorage；
// - 不向 Lesson / corpus / trace / log / URL / 页面文本 写入任何 Key；
// - 仅从 @aiclassroom/llm/presets 引入轻量纯函数与预设目录（零 AI SDK 运行时依赖）。
"use client";

import { create } from "zustand";
import type { ModelConfig, UserProviderConfig } from "@aiclassroom/llm";
import {
  userProviderToModelConfig,
  PROVIDER_PRESETS,
  CUSTOM_PROVIDER_ID,
} from "@aiclassroom/llm/presets";
import { createId } from "@aiclassroom/types";
import {
  listUserProviders,
  saveUserProvider,
  deleteUserProvider,
  setActiveUserProvider,
} from "@aiclassroom/db";

interface UserProvidersState {
  providers: UserProviderConfig[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (cfg: UserProviderConfig) => Promise<void>;
  update: (cfg: UserProviderConfig) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

export const useUserProviders = create<UserProvidersState>((set) => ({
  providers: [],
  loaded: false,
  load: async () => {
    await ensureDefaultProviders();
    const providers = await listUserProviders();
    set({ providers, loaded: true });
  },
  add: async (cfg) => {
    await saveUserProvider(cfg);
    set({ providers: await listUserProviders() });
  },
  update: async (cfg) => {
    await saveUserProvider(cfg);
    set({ providers: await listUserProviders() });
  },
  remove: async (id) => {
    await deleteUserProvider(id);
    let providers = await listUserProviders();
    // 删除当前使用项后，若没有其它激活项，自动启用第一个，避免生成链路无可用 Provider
    if (!providers.some((p) => p.enabled) && providers.length > 0) {
      await setActiveUserProvider(providers[0]!.id);
      providers = await listUserProviders();
    }
    set({ providers });
  },
  setActive: async (id) => {
    await setActiveUserProvider(id);
    set({ providers: await listUserProviders() });
  },
}));

/** 首次进入时把内置 11 家 Provider 作为可配置项写入 Dexie（Key 留空，由用户填写或回落服务端）。 */
export async function ensureDefaultProviders(): Promise<void> {
  const existing = await listUserProviders();
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  for (const p of PROVIDER_PRESETS) {
    await saveUserProvider({
      id: createId(),
      providerId: p.id,
      name: p.name,
      adapter: p.adapter,
      apiKey: "",
      baseUrl: p.defaultBaseUrl,
      model: p.models[0]?.id ?? "",
      enabled: p.id === CUSTOM_PROVIDER_ID ? false : p.id === "qwen",
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** 当前使用的 Provider（enabled 优先，否则取第一个） */
export function activeProvider(
  providers: UserProviderConfig[],
): UserProviderConfig | undefined {
  return providers.find((p) => p.enabled) ?? providers[0];
}

/** 当前 Provider → 服务端 ModelConfig（供生成链路使用，Key 通过 inline 注入） */
export function activeModelConfig(
  providers: UserProviderConfig[],
): ModelConfig | undefined {
  const a = activeProvider(providers);
  return a ? userProviderToModelConfig(a) : undefined;
}

/** 掩码显示：sk-xxxx••••1234，绝不回显完整 Key（实现见 ./mask，便于单测） */
export { maskApiKey } from "./mask";

/** 构造一个自定义 OpenAI Compatible Provider 配置（未启用，待用户保存） */
export function newCustomProvider(
  name: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): UserProviderConfig {
  const now = new Date().toISOString();
  return {
    id: createId(),
    providerId: CUSTOM_PROVIDER_ID,
    name: name.trim() || "自定义 OpenAI Compatible",
    adapter: "openai-compatible",
    apiKey,
    baseUrl,
    model,
    enabled: false,
    createdAt: now,
    updatedAt: now,
  };
}
