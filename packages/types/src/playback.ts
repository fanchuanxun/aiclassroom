// @spec docs/RUNTIME.md §2

import { z } from "zod";
import { IdSchema } from "./common";

export const PlaybackStatusSchema = z.enum([
  "idle",
  "loading",
  "ready",
  "playing",
  "paused",
  "waiting_for_user",
  "error",
  "finished",
]);
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;
export const PlaybackRateSchema = z.union([
  z.literal(0.5),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
]);
export type PlaybackRate = z.infer<typeof PlaybackRateSchema>;

export const PlaybackErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  sceneId: IdSchema.optional(),
  actionId: IdSchema.optional(),
  traceId: IdSchema.optional(),
  at: z.string(),
});
export type PlaybackError = z.infer<typeof PlaybackErrorSchema>;

export const PlaybackStateSchema = z.object({
  status: PlaybackStatusSchema,
  currentSceneIndex: z.number().int().min(0),
  currentActionIndex: z.number().int().min(0),
  elapsedMs: z.number().min(0),
  playbackRate: PlaybackRateSchema,
  errors: z.array(PlaybackErrorSchema),
});
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

/** 合法状态转换表：key 为当前状态，value 为允许的目标状态 */
export const PLAYBACK_TRANSITIONS: Readonly<
  Record<PlaybackStatus, readonly PlaybackStatus[]>
> = {
  idle: ["loading"],
  loading: ["ready", "error"],
  ready: ["playing", "error"],
  playing: ["paused", "waiting_for_user", "finished", "error"],
  paused: ["playing", "error"],
  waiting_for_user: ["playing", "error"],
  error: ["loading", "ready"],
  finished: ["loading", "ready"],
};

export function canTransition(
  from: PlaybackStatus,
  to: PlaybackStatus,
): boolean {
  return PLAYBACK_TRANSITIONS[from].includes(to);
}
