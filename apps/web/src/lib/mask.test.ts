// @spec docs/SECURITY.md
// 掩码测试：UI 永远只拿到掩码后的 Key，绝不回显完整 Key。
import { describe, it, expect } from "vitest";
import { maskApiKey } from "./mask";

describe("maskApiKey", () => {
  it("空 / 未配置 → （未配置）", () => {
    expect(maskApiKey("")).toBe("（未配置）");
    expect(maskApiKey(undefined)).toBe("（未配置）");
  });

  it("短 Key（≤8）→ 全掩码", () => {
    expect(maskApiKey("sk-123")).toBe("•".repeat(6));
  });

  it("完整 Key → 仅首尾保留，中间掩码且不泄露中段", () => {
    const out = maskApiKey("sk-abcdefghijklmnop");
    expect(out).toBe("sk-a••••••••mnop");
    expect(out).not.toContain("bcdefghijk");
    expect(out.length).toBeLessThan("sk-abcdefghijklmnop".length + 1);
  });
});
