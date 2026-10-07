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
  applyUserProviderPlan,
  planPresetProviderRepair,
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

// 回归：批量写入内置 Provider 时，后续写入不得把先前的启用项关掉。
// 历史缺陷下 11 家 seed 完会全部 enabled=false，使生效 Provider 退化为不确定的 providers[0]。
describe("saveUserProvider：enabled=false 不得影响其它记录（回归）", () => {
  it("保存未启用项时保留当前启用项", async () => {
    await saveUserProvider(makeCfg({ id: "a", enabled: true }));
    await saveUserProvider(makeCfg({ id: "b", enabled: false }));
    await saveUserProvider(makeCfg({ id: "c", enabled: false }));
    const enabled = (await listUserProviders()).filter((p) => p.enabled);
    expect(enabled.map((p) => p.id)).toEqual(["a"]);
  });

  it("模拟内置 Provider 顺序 seed：最后仍恰好有一个启用项", async () => {
    const presetIds = ["openai", "anthropic", "qwen", "kimi", "doubao"];
    const now = "2026-01-01T00:00:00.000Z";
    for (const id of presetIds) {
      await saveUserProvider(
        makeCfg({
          id,
          providerId: id,
          enabled: id === "qwen",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const all = await listUserProviders();
    expect(all).toHaveLength(presetIds.length);
    const enabled = all.filter((p) => p.enabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.providerId).toBe("qwen");
    expect((await getActiveUserProvider())!.providerId).toBe("qwen");
  });
});

describe("applyUserProviderPlan：并发幂等（回归 StrictMode 双调用 effect）", () => {
  const PRESETS = ["openai", "qwen", "kimi"];

  const seed = () =>
    applyUserProviderPlan((existing) =>
      existing.length > 0
        ? {}
        : {
            upsert: PRESETS.map((p, i) =>
              makeCfg({ id: `p-${p}`, providerId: p, enabled: i === 1 }),
            ),
          },
    );

  it("并发两次只写入一份，且恰好一个启用项", async () => {
    await Promise.all([seed(), seed()]);
    const all = await listUserProviders();
    expect(all).toHaveLength(PRESETS.length);
    expect(all.filter((p) => p.enabled).map((p) => p.providerId)).toEqual(["qwen"]);
  });

  it("串行两次同样只写入一份（幂等）", async () => {
    await seed();
    await seed();
    expect(await listUserProviders()).toHaveLength(PRESETS.length);
  });

  it("activeId 会互斥地把其它项置为未启用", async () => {
    await applyUserProviderPlan(() => ({
      upsert: [
        makeCfg({ id: "a", providerId: "openai", enabled: true }),
        makeCfg({ id: "b", providerId: "qwen", enabled: true }),
      ],
      activeId: "b",
    }));
    const enabled = (await listUserProviders()).filter((p) => p.enabled);
    expect(enabled.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("planPresetProviderRepair（纯函数）", () => {
  const PRESET_IDS = ["openai", "qwen", "doubao"];

  it("去重内置预设：保留有 Key 的那条", () => {
    const all = [
      makeCfg({ id: "q1", providerId: "qwen", apiKey: "" }),
      makeCfg({ id: "q2", providerId: "qwen", apiKey: "sk-real" }),
      makeCfg({ id: "o1", providerId: "openai", apiKey: "" }),
    ];
    const { remove, activeId } = planPresetProviderRepair(all, PRESET_IDS, "qwen");
    expect(remove).toEqual(["q1"]);
    expect(activeId).toBe("q2");
  });

  it("已有启用项时只去重，不改启用状态", () => {
    const all = [
      makeCfg({ id: "q1", providerId: "qwen", enabled: true }),
      makeCfg({ id: "q2", providerId: "qwen", enabled: false }),
    ];
    const { remove, activeId } = planPresetProviderRepair(all, PRESET_IDS, "qwen");
    expect(remove).toEqual(["q2"]);
    expect(activeId).toBeNull();
  });

  it("绝不清理自定义 Provider（同 providerId 多条也全部保留）", () => {
    const all = [
      makeCfg({ id: "c1", providerId: "custom", apiKey: "sk-1" }),
      makeCfg({ id: "c2", providerId: "custom", apiKey: "sk-2" }),
      makeCfg({ id: "c3", providerId: "custom", apiKey: "sk-3" }),
    ];
    const { remove, activeId } = planPresetProviderRepair(all, PRESET_IDS, "qwen");
    expect(remove).toEqual([]);
    expect(activeId).toBe("c1");
  });

  it("无任何记录时不崩，返回空计划", () => {
    const { remove, activeId } = planPresetProviderRepair([], PRESET_IDS, "qwen");
    expect(remove).toEqual([]);
    expect(activeId).toBeNull();
  });
});
