// @spec docs/PLAN.md (Phase 3)
// 独立于文本 LLM 的图片 Provider 配置模型。

import { z } from "zod";

export const ImageProviderAdapterSchema = z.enum(["openai-images", "openai-compatible-images"]);
export type ImageProviderAdapter = z.infer<typeof ImageProviderAdapterSchema>;

export const ImageProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapter: ImageProviderAdapterSchema,
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ImageProviderConfig = z.infer<typeof ImageProviderConfigSchema>;

export const ImageProviderValidationIssueSchema = z.object({
  field: z.enum(["name", "apiKey", "baseUrl", "model"]),
  message: z.string(),
  level: z.enum(["error", "warning"]),
});
export type ImageProviderValidationIssue = z.infer<typeof ImageProviderValidationIssueSchema>;
