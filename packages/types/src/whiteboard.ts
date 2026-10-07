// @spec docs/DATA-MODEL.md §3.5

import { z } from "zod";
import { IdSchema } from "./common";

export const StrokeSchema = z.object({
  id: IdSchema,
  color: z.string().min(1),
  width: z.number().positive(),
  /** 归一化点位 0~1 */
  points: z.array(
    z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
  ),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const WhiteboardSchema = z.object({
  id: IdSchema,
  strokes: z.array(StrokeSchema),
  background: z.string().optional(),
});
export type Whiteboard = z.infer<typeof WhiteboardSchema>;
