// @spec docs/TRACE.md
// 安全红线：TraceRecord 绝不保存 API Key / Authorization header / 任何 Secret。

import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";

export const TraceStatusSchema = z.enum(["ok", "error"]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const TraceErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  stack: z.string().optional(),
});
export type TraceError = z.infer<typeof TraceErrorSchema>;

export const TraceRecordSchema = z.object({
  id: IdSchema,
  lessonId: IdSchema.optional(),
  sceneId: IdSchema.optional(),
  /** outline_agent / scene_agent / action_agent ... */
  agent: z.string().min(1),
  /** 流水线节点名：retrieve / plan / draft / validate / critique / finalize */
  node: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  /** usage 仅在 Provider 返回时填充，缺失为 0，禁止编造 */
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latencyMs: z.number().min(0),
  costUsd: z.number().min(0).optional(),
  status: TraceStatusSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  error: TraceErrorSchema.optional(),
});
export type TraceRecord = z.infer<typeof TraceRecordSchema>;
