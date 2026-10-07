import type { VideoProvider, VideoService, VideoGenerationTask, VideoGenerationRequest } from "./types";
import { VideoServiceError, VideoGenerationRequestSchema, VideoGenerationTaskSchema } from "./types";

export function createVideoService(provider: VideoProvider): VideoService {
  return {
    async createTask(request) {
      const validated = VideoGenerationRequestSchema.parse(request);
      if (!validated.prompt.trim()) {
        throw new VideoServiceError({
          code: "VIDEO_INVALID_REQUEST",
          message: "prompt is required",
          retryable: false,
        });
      }

      try {
        const task = await provider.createTask(validated);
        return VideoGenerationTaskSchema.parse(task);
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },

    async getTask(taskId) {
      if (!taskId || typeof taskId !== "string" || taskId.trim() === "") {
        throw new VideoServiceError({
          code: "VIDEO_TASK_NOT_FOUND",
          message: "taskId is required",
          retryable: false,
        });
      }

      try {
        const task = await provider.getTask(taskId);
        return VideoGenerationTaskSchema.parse(task);
      } catch (error) {
        throw normalizeProviderError(error, taskId);
      }
    },
  };
}

export class InMemoryVideoProvider implements VideoProvider {
  readonly kind = "in-memory";
  private readonly tasks = new Map<string, VideoGenerationTask>();

  constructor(initialTasks: VideoGenerationTask[] = []) {
    for (const task of initialTasks) {
      this.tasks.set(task.taskId, task);
    }
  }

  async createTask(request: VideoGenerationRequest): Promise<VideoGenerationTask> {
    const now = new Date().toISOString();
    const task: VideoGenerationTask = {
      taskId: crypto.randomUUID(),
      provider: this.kind,
      model: typeof request.model === "string" && request.model.trim() !== "" ? request.model : "unknown",
      status: "pending",
      updatedAt: now,
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  async getTask(taskId: string): Promise<VideoGenerationTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new VideoServiceError({
        code: "VIDEO_TASK_NOT_FOUND",
        message: `Task not found: ${taskId}`,
        retryable: false,
        taskId,
      });
    }
    return task;
  }

  updateTask(taskId: string, patch: Partial<VideoGenerationTask>) {
    const current = this.tasks.get(taskId);
    if (!current) return;
    this.tasks.set(taskId, { ...current, ...patch, updatedAt: new Date().toISOString() });
  }
}

function normalizeProviderError(error: unknown, taskId?: string): VideoServiceError {
  if (error instanceof VideoServiceError) {
    return error;
  }

  const fallbackMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown provider error";
  const message = typeof fallbackMessage === "string" ? fallbackMessage.slice(0, 200) : "Unknown provider error";

  const normalized = new VideoServiceError({
    code: "VIDEO_PROVIDER_ERROR",
    retryable: false,
    message,
    taskId,
    cause: error,
  });

  return normalized;
}