// @spec docs/DATA-MODEL.md §3.3

import { z } from "zod";
import { IdSchema } from "./common";
import { ActionSchema } from "./action";
import { SlideSchema } from "./slide";
import { WhiteboardSchema } from "./whiteboard";

export const SceneStatusSchema = z.enum([
  "pending",
  "generating",
  "ready",
  "failed",
]);
export type SceneStatus = z.infer<typeof SceneStatusSchema>;

export const SceneSchema = z.object({
  id: IdSchema,
  /** 在 Lesson 中的顺序，必须 === 数组下标（INV-1） */
  index: z.number().int().min(0),
  title: z.string().min(1),
  summary: z.string(),
  learningGoals: z.array(z.string()),
  slide: SlideSchema.optional(),
  whiteboard: WhiteboardSchema.optional(),
  actions: z.array(ActionSchema),
  status: SceneStatusSchema,
  durationMs: z.number().min(0).optional(),
  video: z
    .object({
      taskId: z.string().optional(),
      videoId: z.string().optional(),
      status: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
      error: z.string().optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
});
export type Scene = z.infer<typeof SceneSchema>;
