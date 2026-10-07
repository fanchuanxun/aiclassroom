// @spec docs/DATA-MODEL.md §3 / docs/PLAN.md (Phase 1 用户自定义 Provider)
// 用户 Provider 配置的仓储层：新增 / 编辑 / 删除 / 读取 / 设为当前。
// 所有 API Key 仅存于浏览器 IndexedDB（Dexie），绝不进服务端日志 / Lesson / corpus。
//
// 注意：本模块只依赖 @aiclassroom/types 与 @aiclassroom/llm 的类型（import type），
// 不引入任何 AI SDK 运行时，可安全在浏览器侧使用。

import type { UserProviderConfig } from "@aiclassroom/llm";
import { db } from "./db";

/** 列出全部用户 Provider（按更新时间倒序） */
export async function listUserProviders(): Promise<UserProviderConfig[]> {
  const all = await db.userProviders.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 读取单个；不存在返回 undefined */
export async function getUserProvider(
  id: string,
): Promise<UserProviderConfig | undefined> {
  return db.userProviders.get(id);
}

/** 当前使用的 Provider（enabled === true 的第一个） */
export async function getActiveUserProvider(): Promise<UserProviderConfig | undefined> {
  const all = await db.userProviders.toArray();
  return all.find((p) => p.enabled);
}

/**
 * 保存（新增或更新）。
 * 若本次保存的 Provider 被标记为启用，则互斥地把其它 Provider 的 enabled 置为 false，
 * 保证任意时刻至多一个「当前使用」。
 *
 * 不变量：`cfg.enabled === false` 时**不得**改动任何其它记录的 enabled。
 * 历史缺陷：早期实现无条件遍历全表并令 `shouldEnable = p.id === cfg.id && cfg.enabled`，
 * 而新增场景下 `cfg.id` 尚未落表，该表达式对已有记录恒为 false —— 等价于「每保存一条就把
 * 其它全部禁用」。批量写入内置 Provider 时会把先前写入的启用项逐个关掉，最终全表 disabled，
 * 使 activeProvider() 回落到排序键相同的 providers[0]，生效 Provider 变得不确定。
 */
export async function saveUserProvider(cfg: UserProviderConfig): Promise<void> {
  await db.transaction("rw", db.userProviders, async () => {
    if (cfg.enabled) {
      const all = await db.userProviders.toArray();
      for (const p of all) {
        if (p.id !== cfg.id && p.enabled) {
          await db.userProviders.update(p.id, { enabled: false });
        }
      }
    }
    await db.userProviders.put(cfg);
  });
}

/** 删除；调用方负责在被删项为当前使用时改选其它项 */
export async function deleteUserProvider(id: string): Promise<void> {
  await db.userProviders.delete(id);
}

/** 设为当前使用：将 id 置为启用，其余置为禁用 */
export async function setActiveUserProvider(id: string): Promise<void> {
  await db.transaction("rw", db.userProviders, async () => {
    const all = await db.userProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === id;
      if (p.enabled !== shouldEnable) {
        await db.userProviders.update(p.id, { enabled: shouldEnable });
      }
    }
  });
}

/** `applyUserProviderPlan` 的规划结果 */
export interface UserProviderPlan {
  /** 需要删除的记录 id */
  remove: string[];
  /** 需要 upsert 的记录 */
  upsert: UserProviderConfig[];
  /** 非 null 时把该 id 置为唯一启用项 */
  activeId: string | null;
}

/**
 * 事务内完成「读取 → 规划 → 落盘」。
 *
 * 用于首次初始化、批量修复等**读取结果决定写入内容**的场景：把读取和写入放进同一个
 * IndexedDB 事务，使并发调用（React StrictMode 双调用 effect、多标签页同时打开、
 * dev 热重载重复执行）串行化 —— 后进入的事务会看到先提交事务的结果，因此不会重复写入。
 * 仅在事务外先读、再进事务写，无法防住这种竞争。
 */
export async function applyUserProviderPlan(
  plan: (existing: UserProviderConfig[]) => Partial<UserProviderPlan>,
): Promise<void> {
  await db.transaction("rw", db.userProviders, async () => {
    const existing = await db.userProviders.toArray();
    const { remove = [], upsert = [], activeId = null } = plan(existing);

    for (const id of remove) {
      await db.userProviders.delete(id);
    }
    for (const cfg of upsert) {
      await db.userProviders.put(cfg);
    }
    if (activeId !== null) {
      for (const p of await db.userProviders.toArray()) {
        const shouldEnable = p.id === activeId;
        if (p.enabled !== shouldEnable) {
          await db.userProviders.update(p.id, { enabled: shouldEnable });
        }
      }
    }
  });
}

/**
 * 纯函数：为**内置预设** Provider 规划去重与当前启用项。
 *
 * 去重只针对 `providerId ∈ presetIds` 的记录，因为用户可能刻意建多个自定义
 * Provider（它们共用 `CUSTOM_PROVIDER_ID`，按 providerId 去重会误删真实配置）。
 * 同一预设内保留优先级：已填 Key > 启用中 > createdAt 更早。
 *
 * 若去重后没有任何启用项，则启用 `preferredPresetId` 对应项（缺失时取第一条）。
 */
export function planPresetProviderRepair(
  all: UserProviderConfig[],
  presetIds: readonly string[],
  preferredPresetId: string,
): { remove: string[]; activeId: string | null } {
  const presets = new Set(presetIds);
  const groups = new Map<string, UserProviderConfig[]>();
  for (const p of all) {
    const group = groups.get(p.providerId);
    if (group) group.push(p);
    else groups.set(p.providerId, [p]);
  }

  const remove: string[] = [];
  const kept: UserProviderConfig[] = [];
  for (const [providerId, group] of groups) {
    if (!presets.has(providerId) || group.length === 1) {
      kept.push(...group);
      continue;
    }
    const [winner, ...losers] = [...group].sort(
      (a, b) =>
        Number(Boolean(b.apiKey)) - Number(Boolean(a.apiKey)) ||
        Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)) ||
        a.createdAt.localeCompare(b.createdAt),
    );
    kept.push(winner!);
    remove.push(...losers.map((l) => l.id));
  }

  if (kept.some((p) => p.enabled)) {
    return { remove, activeId: null };
  }
  const preferred =
    kept.find((p) => p.providerId === preferredPresetId) ?? kept[0];
  return { remove, activeId: preferred?.id ?? null };
}
