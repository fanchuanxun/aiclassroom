import { z } from "zod";

export const VideoTaskStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type VideoTaskStatus = z.infer<typeof VideoTaskStatusSchema>;

export const VideoGenerationTaskSchema = z.object({
  taskId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: VideoTaskStatusSchema,
  videoId: z.string().optional(),
  videoUrl: z.string().url().optional(),
  error: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type VideoGenerationTask = z.infer<typeof VideoGenerationTaskSchema>;

export const VideoGenerationRequestSchema = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type VideoGenerationRequest = z.infer<typeof VideoGenerationRequestSchema>;

export const VideoProviderErrorCodeSchema = z.enum([
  "VIDEO_INVALID_REQUEST",
  "VIDEO_PROVIDER_ERROR",
  "VIDEO_TASK_NOT_FOUND",
  "VIDEO_TASK_FAILED",
]);
export type VideoProviderErrorCode = z.infer<typeof VideoProviderErrorCodeSchema>;

export class VideoServiceError extends Error {
  readonly code: VideoProviderErrorCode;
  readonly retryable: boolean;
  readonly taskId?: string;
  override readonly cause?: unknown;

  constructor(options: {
    code: VideoProviderErrorCode;
    message: string;
    retryable?: boolean;
    taskId?: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "VideoServiceError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.taskId = options.taskId;
    this.cause = options.cause;
  }
}

export interface VideoProvider {
  readonly kind: string;
  createTask(request: VideoGenerationRequest): Promise<VideoGenerationTask>;
  getTask(taskId: string): Promise<VideoGenerationTask>;
}

export interface VideoService {
  createTask(request: VideoGenerationRequest): Promise<VideoGenerationTask>;
  getTask(taskId: string): Promise<VideoGenerationTask>;
}
