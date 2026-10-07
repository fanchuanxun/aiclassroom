// @spec docs/PLAN.md (Phase 3)
// 视频 Provider 的最小配置模型，独立于文本 LLM 与图片 Provider。

import { z } from "zod";

export const VideoProviderAdapterSchema = z.enum(["openai-compatible-video"]);
export type VideoProviderAdapter = z.infer<typeof VideoProviderAdapterSchema>;

export const VideoProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapter: VideoProviderAdapterSchema,
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VideoProviderConfig = z.infer<typeof VideoProviderConfigSchema>;
