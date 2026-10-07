// @spec docs/DATA-MODEL.md §3.2

import { z } from "zod";
import { IdSchema } from "./common";

/**
 * TTS 语音配置。
 * MVP 使用 Web Speech API（provider: "web-speech"），
 * 架构上保留 "cloud" 以便后续接入云端 TTS / 多角色语音。
 */
export const VoiceConfigSchema = z.object({
  provider: z.enum(["web-speech", "cloud"]),
  /** Web Speech API 的 voice URI；云端 TTS 时为厂商 voice id */
  voiceURI: z.string().optional(),
  /** 语速 0.5 ~ 2 */
  rate: z.number().min(0.5).max(2).optional(),
  /** 音调 0 ~ 2 */
  pitch: z.number().min(0).max(2).optional(),
  /** 语言标签，如 "zh-CN" */
  lang: z.string().optional(),
});
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const RoleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  kind: z.enum(["teacher", "student"]),
  /** emoji 或图片 URL */
  avatarUrl: z.string().min(1),
  /** 一句话人设 */
  personality: z.string(),
  /** 详细介绍（角色介绍浮层用） */
  bio: z.string(),
  voice: VoiceConfigSchema,
  /** 注入 system prompt 的角色设定，决定说话风格与行为模式 */
  promptPersona: z.string(),
  /** 品牌色 */
  color: z.string().min(1),
});
export type Role = z.infer<typeof RoleSchema>;
