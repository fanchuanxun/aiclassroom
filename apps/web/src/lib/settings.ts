// @spec docs/PLAN.md (Phase 1A)
// 设置 store：仅保留「默认语种」这类非敏感偏好。
// Provider / API Key / Model 等敏感配置已迁移到 Dexie（userProviders 表），
// 仅存浏览器 IndexedDB，绝不进 localStorage / 服务端日志。
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@aiclassroom/types";

export interface SettingsState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: "zh-CN",
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: "aiclassroom-settings",
      partialize: (s) => ({ language: s.language }),
    },
  ),
);
