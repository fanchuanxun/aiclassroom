import { describe, expect, it } from "vitest";
import type { VideoProvider, VideoGenerationTask } from "./types";
import { createVideoService, InMemoryVideoProvider } from "./service";

function fakeProvider(overrides: Partial<VideoProvider> = {}): VideoProvider {
  return {
    kind: "fake",
    createTask: async () => {
      throw new Error("not implemented");
    },
    getTask: async () => {
      throw new Error("not implemented");
    },
    ...overrides,
  } as VideoProvider;
}

describe("createVideoService", () => {
  it("creates a task through provider and returns normalized task", async () => {
    const service = createVideoService(fakeProvider({
      createTask: async () =>
        ({
          taskId: "created-task",
          provider: "in-memory",
          model: "agnes-video-v2.0",
          status: "pending",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }) as VideoGenerationTask,
    }));

    const task = await service.createTask({
      sceneId: "scene-1",
      prompt: "intro video",
      model: "agnes-video-v2.0",
    });

    expect(task).toMatchObject({
      taskId: "created-task",
      provider: "in-memory",
      model: "agnes-video-v2.0",
      status: "pending",
    });
  });

  it("rejects invalid request without calling provider", async () => {
    const service = createVideoService(fakeProvider());

    await expect(
      service.createTask({
        sceneId: "scene-1",
        prompt: "  ",
      } as never),
    ).rejects.toMatchObject({ code: "VIDEO_INVALID_REQUEST" });
  });

  it("returns not-found error for missing task", async () => {
    const service = createVideoService(new InMemoryVideoProvider());

    await expect(service.getTask("missing-task")).rejects.toMatchObject({
      code: "VIDEO_TASK_NOT_FOUND",
    });
  });

  it("does not depend on provider-specific naming beyond normalized contract", async () => {
    const provider = fakeProvider({
      kind: "custom-video",
      createTask: async () =>
        ({
          taskId: "task-1",
          provider: "custom-video",
          model: "custom-model",
          status: "succeeded",
          videoId: "video-1",
          videoUrl: "https://example.com/video.mp4",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies VideoGenerationTask),
      getTask: async () =>
        ({
          taskId: "task-1",
          provider: "custom-video",
          model: "custom-model",
          status: "succeeded",
          videoId: "video-1",
          videoUrl: "https://example.com/video.mp4",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies VideoGenerationTask),
    });
    const service = createVideoService(provider);

    const created = await service.createTask({
      sceneId: "scene-1",
      prompt: "custom video",
      model: "custom-model",
    });

    expect(created.taskId).toBe("task-1");
    expect(await service.getTask("task-1")).toMatchObject({
      taskId: "task-1",
      provider: "custom-video",
      status: "succeeded",
      videoId: "video-1",
    });
  });

  it("does not leak secrets through provider error messages", async () => {
    const provider = fakeProvider({
      createTask: async () => {
        throw new Error("Provider rejected request: SECRET_API_KEY");
      },
    });

    const service = createVideoService(provider);

    await expect(
      service.createTask({
        sceneId: "scene-1",
        prompt: "video",
      }),
    ).rejects.toMatchObject({
      code: "VIDEO_PROVIDER_ERROR",
    });
  });

  it("preserves optional videoUrl and missing fields for legacy-lesson compatibility", async () => {
    const legacyTask = {
      taskId: "legacy-task",
      provider: "in-memory",
      model: "legacy",
      status: "pending",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as VideoGenerationTask;
    const provider = fakeProvider({
      createTask: async () => legacyTask,
      getTask: async () => legacyTask,
    });
    const service = createVideoService(provider);

    const task = await service.getTask("legacy-task");

    expect(task.videoUrl).toBeUndefined();
    expect(task.videoId).toBeUndefined();
    expect(task.status).toBe("pending");
  });
});