// @spec docs/PLAN.md (Phase 3)
// 视频 Provider 配置的持久化层：新增 / 编辑 / 删除 / 读取 / 设为当前。
// 与文本 LLM、图片 Provider 相互独立。

import type { VideoProviderConfig } from "@aiclassroom/types";
import { db } from "./db";

export async function listVideoProviders(): Promise<VideoProviderConfig[]> {
  const all = await db.videoProviders.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getVideoProvider(id: string): Promise<VideoProviderConfig | undefined> {
  return db.videoProviders.get(id);
}

export async function getActiveVideoProvider(): Promise<VideoProviderConfig | undefined> {
  const all = await db.videoProviders.toArray();
  return all.find((p) => p.enabled);
}

export async function saveVideoProvider(cfg: VideoProviderConfig): Promise<void> {
  await db.transaction("rw", db.videoProviders, async () => {
    const all = await db.videoProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === cfg.id && cfg.enabled;
      if (p.enabled !== shouldEnable) {
        await db.videoProviders.update(p.id, { enabled: shouldEnable });
      }
    }
    await db.videoProviders.put(cfg);
  });
}

export async function deleteVideoProvider(id: string): Promise<void> {
  await db.videoProviders.delete(id);
}

export async function setActiveVideoProvider(id: string): Promise<void> {
  await db.transaction("rw", db.videoProviders, async () => {
    const all = await db.videoProviders.toArray();
    for (const p of all) {
      const shouldEnable = p.id === id;
      if (p.enabled !== shouldEnable) {
        await db.videoProviders.update(p.id, { enabled: shouldEnable });
      }
    }
  });
}
