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
  applyUserProviderPlan,
  planPresetProviderRepair,
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

/**
 * 默认启用的内置 Provider。
 * 取 qwen（通义千问 / 百炼，adapter = openai-compatible），与服务端
 * OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY 的示例配置对齐（见 .env.example）。
 */
const DEFAULT_ACTIVE_PRESET = "qwen";

/** 单飞句柄：dev 下 React StrictMode 会把 effect 调用两次，必须只真正执行一次。 */
let seeding: Promise<void> | null = null;

/**
 * 首次进入时把内置 11 家 Provider 作为可配置项写入 Dexie（Key 留空，由用户填写或回落服务端），
 * 并对历史数据做一次幂等修复。
 *
 * 幂等性来自两层保证：
 * 1) 单飞 —— 同一模块实例内的并发调用复用同一个 Promise；
 * 2) 事务内二次校验 —— `applyUserProviderPlan` 把「读空表」和「写入」放在同一个
 *    IndexedDB 事务里，跨模块实例（dev 热重载）或多标签页的并发调用也会被串行化。
 *
 * 修复内容：清理历史重复写入的内置 Provider，并保证恰好有一个「当前使用」，
 * 避免 activeProvider() 回落到排序不确定的 providers[0]。
 */
export function ensureDefaultProviders(): Promise<void> {
  if (!seeding) {
    seeding = seedDefaultProviders().catch((err: unknown) => {
      seeding = null; // 失败不缓存，允许下次重试
      throw err;
    });
  }
  return seeding;
}

async function seedDefaultProviders(): Promise<void> {
  const presetIds = PROVIDER_PRESETS.map((p) => p.id);

  await applyUserProviderPlan((existing) => {
    // 已有数据：只做去重 + 补齐「当前使用」，不重新 seed。
    if (existing.length > 0) {
      const { remove, activeId } = planPresetProviderRepair(
        existing,
        presetIds,
        DEFAULT_ACTIVE_PRESET,
      );
      return { remove, activeId };
    }

    // 空库：写入内置 Provider，默认启用 DEFAULT_ACTIVE_PRESET。
    const now = new Date().toISOString();
    return {
      upsert: PROVIDER_PRESETS.map((p) => ({
        id: createId(),
        providerId: p.id,
        name: p.name,
        adapter: p.adapter,
        apiKey: "",
        baseUrl: p.defaultBaseUrl,
        model: p.models[0]?.id ?? "",
        enabled: p.id === DEFAULT_ACTIVE_PRESET,
        createdAt: now,
        updatedAt: now,
      })),
    };
  });
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
