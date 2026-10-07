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
 */
export async function saveUserProvider(cfg: UserProviderConfig): Promise<void> {
  await db.transaction("rw", db.userProviders, async () => {
    const all = await db.userProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === cfg.id && cfg.enabled;
      if (p.enabled !== shouldEnable) {
        await db.userProviders.update(p.id, { enabled: shouldEnable });
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
