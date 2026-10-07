// @spec docs/DATA-MODEL.md §3 / docs/PLAN.md (Phase 3)
// 图片 Provider 配置的持久化层：新增 / 编辑 / 删除 / 读取 / 设为当前。
// 与文本 LLM 的 userProviders 相互独立，避免污染 ModelConfig / generate 链路。

import type { ImageProviderConfig } from "@aiclassroom/types";
import { db } from "./db";

export async function listImageProviders(): Promise<ImageProviderConfig[]> {
  const all = await db.imageProviders.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getImageProvider(id: string): Promise<ImageProviderConfig | undefined> {
  return db.imageProviders.get(id);
}

export async function getActiveImageProvider(): Promise<ImageProviderConfig | undefined> {
  const all = await db.imageProviders.toArray();
  return all.find((p) => p.enabled);
}

export async function saveImageProvider(cfg: ImageProviderConfig): Promise<void> {
  await db.transaction("rw", db.imageProviders, async () => {
    const all = await db.imageProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === cfg.id && cfg.enabled;
      if (p.enabled !== shouldEnable) {
        await db.imageProviders.update(p.id, { enabled: shouldEnable });
      }
    }
    await db.imageProviders.put(cfg);
  });
}

export async function deleteImageProvider(id: string): Promise<void> {
  await db.imageProviders.delete(id);
}

export async function setActiveImageProvider(id: string): Promise<void> {
  await db.transaction("rw", db.imageProviders, async () => {
    const all = await db.imageProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === id;
      if (p.enabled !== shouldEnable) {
        await db.imageProviders.update(p.id, { enabled: shouldEnable });
      }
    }
  });
}
