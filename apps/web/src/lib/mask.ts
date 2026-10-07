// @spec docs/PLAN.md (Phase 1 用户自定义 Provider)
// API Key 掩码：UI 永远不显示完整 Key。纯函数，无副作用、无 Dexie 依赖，便于单测。
export function maskApiKey(key: string | undefined): string {
  if (!key || key.trim() === "") return "（未配置）";
  const k = key.trim();
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}
