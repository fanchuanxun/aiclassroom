// @spec docs/DATA-MODEL.md §3.1

import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common";
import { RoleSchema } from "./role";
import { SceneSchema } from "./scene";

export const LessonStatusSchema = z.enum([
  "draft",
  "outlining",
  "scenes_generating",
  "actions_generating",
  "ready",
  "failed",
]);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

export const LanguageSchema = z.enum(["zh-CN", "en-US"]);
export type Language = z.infer<typeof LanguageSchema>;

export const MaterialSchema = z.object({
  id: IdSchema,
  kind: z.enum(["text", "url", "file"]),
  title: z.string(),
  content: z.string().optional(),
  url: z.string().optional(),
});
export type Material = z.infer<typeof MaterialSchema>;

/** 生成该课程时使用的模型快照，便于复现与成本归因 */
export const ModelSnapshotSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
});
export type ModelSnapshot = z.infer<typeof ModelSnapshotSchema>;

export const LessonMetaSchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedDurationMin: z.number().positive(),
  model: ModelSnapshotSchema.optional(),
  /** 用户选择的场景数（1-4），用于加速生成与成本控制；缺省时由 Outline Agent 决定 */
  sceneCount: z.number().int().min(1).max(6).optional(),
});
export type LessonMeta = z.infer<typeof LessonMetaSchema>;

export const LessonSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  description: z.string(),
  /** 用户原始输入 */
  topic: z.string().min(1),
  language: LanguageSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  status: LessonStatusSchema,
  /** 1 位老师 + N 位学生 */
  roles: z.array(RoleSchema),
  scenes: z.array(SceneSchema),
  sourceMaterials: z.array(MaterialSchema).optional(),
  meta: LessonMetaSchema,
});
export type Lesson = z.infer<typeof LessonSchema>;
