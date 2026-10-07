// @spec docs/AGENT-ARCHITECTURE.md
// Agent 的结构化输入/输出契约。放在 packages/types 供前后端共享。

import { z } from "zod";
import { ActionSchema } from "./action";
import { SlideSchema } from "./slide";

/** outline_agent 输出的单个场景骨架 */
export const OutlineSceneSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  learningGoals: z.array(z.string()).min(1),
});

export const OutlineOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  scenes: z.array(OutlineSceneSchema).min(1),
  estimatedDurationMin: z.number().positive(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
});
export type OutlineOutput = z.infer<typeof OutlineOutputSchema>;
export type OutlineScene = z.infer<typeof OutlineSceneSchema>;

/** scene_agent 输出：一个 Scene 的 slide + 讲稿 */
export const SceneOutputSchema = z.object({
  slide: SlideSchema,
  script: z.string().min(1),
});
export type SceneOutput = z.infer<typeof SceneOutputSchema>;

/** action_agent 输出：播放引擎可执行的 Action 序列 */
export const ActionOutputSchema = z.object({
  actions: z.array(ActionSchema).min(1),
});
export type ActionOutput = z.infer<typeof ActionOutputSchema>;
