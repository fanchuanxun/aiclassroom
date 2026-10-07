// @spec docs/DATA-MODEL.md §3.6
// Action 是播放引擎的最小执行单元，每种 Action 对应一个 executor。
// 这里刻意使用判别联合（discriminated union），禁止 { type: string; payload: any }。

import { z } from "zod";
import { IdSchema } from "./common";
import { StrokeSchema } from "./whiteboard";

export const ACTION_TYPES = [
  "SPEECH",
  "SLIDE",
  "FOCUS",
  "WRITE",
  "INTERACT",
  "DISCUSS",
  "WAIT",
] as const;

export const ActionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof ActionTypeSchema>;

/** Phase 1 真实实现的 Action 类型；其余在架构上留位 */
export const PHASE1_ACTION_TYPES = ["SPEECH", "SLIDE"] as const;

const ActionBaseSchema = z.object({
  id: IdSchema,
  /** 哪个角色发起 */
  roleId: IdSchema.optional(),
  /** 相对 Scene 起点的时间 */
  startAtMs: z.number().min(0).optional(),
  /** 是否阻塞后续 action */
  blocking: z.boolean(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** SPEECH — 角色讲话（TTS + 字幕） */
export const SpeechActionSchema = ActionBaseSchema.extend({
  type: z.literal("SPEECH"),
  text: z.string().min(1),
  emotion: z.enum(["neutral", "excited", "serious", "friendly"]).optional(),
  showSubtitle: z.boolean(),
});
export type SpeechAction = z.infer<typeof SpeechActionSchema>;

/** SLIDE — 切换/展示幻灯片 */
export const SlideActionSchema = ActionBaseSchema.extend({
  type: z.literal("SLIDE"),
  op: z.enum(["show", "next", "prev", "goto"]),
  slideId: IdSchema.optional(),
});
export type SlideAction = z.infer<typeof SlideActionSchema>;

/** FOCUS — 聚焦 Slide 内某个元素（Phase 2） */
export const FocusActionSchema = ActionBaseSchema.extend({
  type: z.literal("FOCUS"),
  elementId: IdSchema,
  style: z.enum(["spotlight", "zoom"]),
  durationMs: z.number().min(0),
});
export type FocusAction = z.infer<typeof FocusActionSchema>;

/** WRITE — 白板绘制（Phase 2） */
export const WriteActionSchema = ActionBaseSchema.extend({
  type: z.literal("WRITE"),
  strokes: z.array(StrokeSchema),
  speedMs: z.number().min(0),
});
export type WriteAction = z.infer<typeof WriteActionSchema>;

/** INTERACT — 提问/测验/投票（Phase 2） */
export const InteractActionSchema = ActionBaseSchema.extend({
  type: z.literal("INTERACT"),
  kind: z.enum(["quiz", "open_question", "poll", "code"]),
  prompt: z.string().min(1),
  choices: z
    .array(
      z.object({
        id: IdSchema,
        text: z.string(),
        correct: z.boolean().optional(),
      }),
    )
    .optional(),
  acceptUserInput: z.boolean(),
  timeoutMs: z.number().min(0).optional(),
  onAnswer: z
    .object({
      nextAction: z.enum(["advance", "repeat", "branch"]).optional(),
      branchToActionId: IdSchema.optional(),
    })
    .optional(),
});
export type InteractAction = z.infer<typeof InteractActionSchema>;

/** DISCUSS — 多 Agent 讨论（Phase 2） */
export const DiscussActionSchema = ActionBaseSchema.extend({
  type: z.literal("DISCUSS"),
  topic: z.string().min(1),
  participantRoleIds: z.array(IdSchema),
  minRounds: z.number().int().min(0),
  maxRounds: z.number().int().min(0),
  moderationPrompt: z.string().optional(),
});
export type DiscussAction = z.infer<typeof DiscussActionSchema>;

/** WAIT — 纯等待（Phase 2） */
export const WaitActionSchema = ActionBaseSchema.extend({
  type: z.literal("WAIT"),
  durationMs: z.number().min(0),
});
export type WaitAction = z.infer<typeof WaitActionSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  SpeechActionSchema,
  SlideActionSchema,
  FocusActionSchema,
  WriteActionSchema,
  InteractActionSchema,
  DiscussActionSchema,
  WaitActionSchema,
]);
export type Action = z.infer<typeof ActionSchema>;

/** 按 Action 类型取出对应子类型 */
export type ActionOfType<T extends ActionType> = Extract<Action, { type: T }>;
