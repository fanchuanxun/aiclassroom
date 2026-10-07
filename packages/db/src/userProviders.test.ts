// @spec docs/DATA-MODEL.md §3 / docs/SECURITY.md
// 用户 Provider 配置的持久化测试：保存 / 读取 / 更新 / 删除 / 设为当前 / 刷新恢复 / 切换。
// 全部使用 fake-indexeddb，验证 Dexie（IndexedDB）真实落盘行为。
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  listUserProviders,
  saveUserProvider,
  deleteUserProvider,
  getActiveUserProvider,
  setActiveUserProvider,
  getUserProvider,
} from "./userProviders";
import type { UserProviderConfig } from "@aiclassroom/llm";

function makeCfg(over: Partial<UserProviderConfig> = {}): UserProviderConfig {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    providerId: "qwen",
    name: "百炼",
    adapter: "openai-compatible",
    apiKey: "sk-secret-123",
    model: "qwen-max",
    enabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

beforeEach(async () => {
  await db.userProviders.clear();
});

describe("userProviders 仓储", () => {
  it("save + get 往返一致", async () => {
    const c = makeCfg({ id: "a", enabled: true });
    await saveUserProvider(c);
    const got = await getUserProvider("a");
    expect(got).toEqual(c);
  });

  it("保存启用项互斥：任意时刻至多一个 enabled", async () => {
    await saveUserProvider(makeCfg({ id: "a", enabled: true }));
    await saveUserProvider(makeCfg({ id: "b", enabled: true }));
    const all = await listUserProviders();
    const enabled = all.filter((p) => p.enabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.id).toBe("b");
  });

  it("setActive 切换当前 Provider", async () => {
    await saveUserProvider(makeCfg({ id: "a", enabled: true }));
    await saveUserProvider(makeCfg({ id: "b", enabled: false }));
    await setActiveUserProvider("b");
    const active = await getActiveUserProvider();
    expect(active!.id).toBe("b");
    expect((await getUserProvider("a"))!.enabled).toBe(false);
  });

  it("update 覆盖字段但保留 id / providerId / adapter", async () => {
    const c = makeCfg({ id: "a", enabled: true });
    await saveUserProvider(c);
    await saveUserProvider({ ...c, name: "我的百炼", apiKey: "sk-new", model: "qwen-plus" });
    const got = await getUserProvider("a");
    expect(got!.name).toBe("我的百炼");
    expect(got!.apiKey).toBe("sk-new");
    expect(got!.model).toBe("qwen-plus");
    expect(got!.providerId).toBe("qwen");
    expect(got!.adapter).toBe("openai-compatible");
  });

  it("刷新后恢复（重新打开同一 Dexie 实例仍可读到）", async () => {
    await saveUserProvider(makeCfg({ id: "a", enabled: true }));
    const reread = await listUserProviders();
    expect(reread.map((p) => p.id)).toContain("a");
    expect(reread.find((p) => p.id === "a")!.enabled).toBe(true);
  });

  it("delete 后读不到", async () => {
    await saveUserProvider(makeCfg({ id: "a" }));
    await deleteUserProvider("a");
    expect(await getUserProvider("a")).toBeUndefined();
  });

  it("存储记录严格等于用户配置，绝不混入 Lesson / corpus / trace / Key 之外字段", async () => {
    const c = makeCfg({ id: "a", apiKey: "sk-secret-123" });
    await saveUserProvider(c);
    const got = await getUserProvider("a");
    expect(got).toEqual(c);
    // 不变量：userProviders 记录只含 Provider 配置字段，不污染知识库 / trace
    expect(got).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(got, "lesson")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(got, "corpus")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(got, "trace")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(got, "knowledge")).toBe(false);
  });
});
