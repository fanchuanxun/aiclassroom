// @spec docs/PLAN.md (Phase 1B) / docs/ARCHITECTURE.md (Orchestrator)
// 生成编排器：把 outline / scene / action 三个真实 SSE 端点串联成流水线，
// 实时写回 Dexie，并在「首个场景就绪」时通知 UI 进入课堂。
// 这是真实调用 LLM 的入口（SSE 端点内部调用 agents 包）。

import type {
  Action,
  ErrorCode,
  Language,
  Lesson,
  OutlineOutput,
  Role,
  Scene,
  SceneOutput,
} from "@aiclassroom/types";
import type { ModelConfig } from "@aiclassroom/llm";
import { AppError } from "@aiclassroom/types";
import { getLesson, saveLesson } from "@aiclassroom/db";
import { postSSE } from "@/lib/sse-client";
import { defaultRoles } from "./roles";
import { generateSlideImageFromActiveProvider } from "@aiclassroom/image-service";

export interface GenCallbacks {
  onOutline?: (outline: OutlineOutput) => void;
  /** Outline 流水线内部节点进度（draft / validate / critique…），用于暴露「卡在哪一步」 */
  onOutlineProgress?: (node: string, message: string) => void;
  onSceneSlide?: (index: number, output: SceneOutput) => void;
  onSceneImage?: (index: number) => void;
  onSceneActions?: (index: number, actions: Action[]) => void;
  onSceneStatus?: (index: number, status: Scene["status"]) => void;
  /** 某场景流水线内部节点进度（按 index 区分） */
  onSceneProgress?: (index: number, node: string, message: string) => void;
  onFirstSceneReady?: (lessonId: string) => void;
  onError?: (e: {
    code: string;
    message: string;
    retryable: boolean;
    sceneIndex?: number;
  }) => void;
  onDone?: () => void;
}

/** 创建课程骨架（outlining 状态，空场景），用于用户点「开始生成」后落地。 */
export function createLessonSkeleton(
  topic: string,
  language: Language,
  roles?: Role[],
  sceneCount?: number,
): Lesson {
  const now = new Date().toISOString();
  const usedRoles = roles ?? defaultRoles();
  return {
    id: crypto.randomUUID(),
    title: topic,
    description: "",
    topic,
    language,
    createdAt: now,
    updatedAt: now,
    status: "outlining",
    roles: usedRoles,
    scenes: [],
    meta: {
      difficulty: "beginner",
      estimatedDurationMin: 10,
      ...(sceneCount ? { sceneCount } : {}),
    },
  };
}

interface SseError {
  type: "error";
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

function isSseError(e: unknown): e is SseError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as Record<string, unknown>).type === "error"
  );
}

function sceneBriefOf(outline: OutlineOutput, index: number) {
  const s = outline.scenes[index]!;
  return {
    id: `scene-${index + 1}`,
    index,
    total: outline.scenes.length,
    title: s.title,
    summary: s.summary,
    learningGoals: s.learningGoals,
  };
}

export async function generateLesson(opts: {
  lessonId: string;
  model: ModelConfig;
  sceneCount?: number;
  signal?: AbortSignal;
  callbacks: GenCallbacks;
}): Promise<void> {
  const { lessonId, model, sceneCount, signal, callbacks } = opts;
  const base = await getLesson(lessonId);
  if (base === undefined) {
    throw new AppError("GENERATION_ERROR", `课程不存在：${lessonId}`, {
      retryable: false,
    });
  }
  if (base.status === "ready") return; // 已完成则跳过

  let lesson: Lesson = base;
  let firstSceneFired = false;
  const effectiveSceneCount = sceneCount ?? lesson.meta.sceneCount;

  const patchScene = (index: number, patch: Partial<Scene>): void => {
    lesson.scenes[index] = { ...lesson.scenes[index]!, ...patch };
  };

  // ---- 1. Outline ----
  const outline = await fetchOutline(lesson, model, signal, effectiveSceneCount, callbacks);
  lesson = {
    ...lesson,
    title: outline.title,
    description: outline.description,
    status: "scenes_generating",
    meta: {
      difficulty: outline.difficulty,
      estimatedDurationMin: outline.estimatedDurationMin,
      ...(lesson.meta.model ? { model: lesson.meta.model } : {}),
    },
    scenes: outline.scenes.map((s, i) => ({
      id: `scene-${i + 1}`,
      index: i,
      title: s.title,
      summary: s.summary,
      learningGoals: s.learningGoals,
      status: "pending",
      actions: [],
    })),
  };
  await saveLesson(lesson);
  callbacks.onOutline?.(outline);

  // ---- 2+3. 每个场景：scene 生成 → action 生成（顺序，保证场景 0 最先就绪） ----
  for (let i = 0; i < lesson.scenes.length; i += 1) {
    const brief = sceneBriefOf(outline, i);
    patchScene(i, { status: "generating" });
    callbacks.onSceneStatus?.(i, "generating");
    await saveLesson(lesson);

    // 2. Scene（slide + script）
    let sceneOut: SceneOutput;
    try {
      sceneOut = await fetchScene(lesson, brief, outline, model, signal, callbacks);
    } catch (err) {
      reportSceneError(i, err);
      continue;
    }
    const slideWithScript = { ...sceneOut.slide, notes: sceneOut.script };
    patchScene(i, { slide: slideWithScript, status: "ready" });
    callbacks.onSceneSlide?.(i, sceneOut);
    await saveLesson(lesson);

    await tryGenerateSceneImage(lesson, i);

    // 3. Action（编排动作）
    const knownSlideIds = lesson.scenes
      .map((s) => s.slide?.id)
      .filter((id): id is string => id !== undefined);
    let actions: Action[];
    try {
      actions = await fetchActions(
        lesson,
        lesson.scenes[i]!,
        slideWithScript,
        sceneOut.script,
        knownSlideIds,
        model,
        signal,
        callbacks,
      );
    } catch (err) {
      reportSceneError(i, err);
      continue;
    }
    patchScene(i, { actions });
    callbacks.onSceneActions?.(i, actions);
    await saveLesson(lesson);

    if (!firstSceneFired) {
      firstSceneFired = true;
      callbacks.onFirstSceneReady?.(lessonId);
    }
  }

  lesson = { ...lesson, status: "ready" };
  await saveLesson(lesson);
  callbacks.onDone?.();

  function reportSceneError(index: number, err: unknown): void {
    const appError =
      err instanceof AppError
        ? err
        : new AppError("GENERATION_ERROR", String(err), { retryable: false });
    patchScene(index, { status: "failed" });
    callbacks.onSceneStatus?.(index, "failed");
    callbacks.onError?.({
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      sceneIndex: index,
    });
  }

  async function tryGenerateSceneImage(lessonSnapshot: Lesson, index: number): Promise<void> {
    const scene = lessonSnapshot.scenes[index];
    if (!scene?.slide) return;

    try {
      const result = await generateSlideImageFromActiveProvider({
        lessonId,
        sceneIndex: index,
      });
      if (result.ok && result.imageUrl) {
        patchScene(index, {
          slide: { ...scene.slide, imageUrl: result.imageUrl },
        });
        await saveLesson(lesson);
      }
    } catch {
      // 图片生成失败不影响课程生成链路，仅静默忽略，Studio 仍可通过「重试」恢复。
    }
  }
}

async function fetchOutline(
  lesson: Lesson,
  model: ModelConfig,
  signal: AbortSignal | undefined,
  sceneCount: number | undefined,
  callbacks: GenCallbacks,
): Promise<OutlineOutput> {
  let result: OutlineOutput | undefined;
  await postSSE(
    "/api/generate/outline",
    {
      topic: lesson.topic,
      language: lesson.language,
      roles: lesson.roles,
      ...(sceneCount ? { sceneCount } : {}),
      model,
    },
    {
      signal,
      onEvent: (e) => {
        if (isSseError(e)) throw new AppError(e.code, e.message, { retryable: e.retryable });
        if (e.type === "outline_ready") result = e.outline as OutlineOutput;
        if (e.type === "progress")
          callbacks.onOutlineProgress?.(String(e.node ?? ""), String(e.message ?? ""));
      },
    },
  );
  if (result === undefined) {
    throw new AppError("GENERATION_ERROR", "未收到 outline_ready 事件", {
      retryable: true,
    });
  }
  return result;
}

async function fetchScene(
  lesson: Lesson,
  brief: ReturnType<typeof sceneBriefOf>,
  outline: OutlineOutput,
  model: ModelConfig,
  signal: AbortSignal | undefined,
  callbacks: GenCallbacks,
): Promise<SceneOutput> {
  let result: SceneOutput | undefined;
  const previousSceneTitles = outline.scenes
    .slice(0, brief.index)
    .map((s) => s.title);
  await postSSE(
    "/api/generate/scene",
    {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lessonDescription: lesson.description,
      topic: lesson.topic,
      language: lesson.language,
      roles: lesson.roles,
      scene: brief,
      ...(previousSceneTitles.length > 0 ? { previousSceneTitles } : {}),
      model,
    },
    {
      signal,
      onEvent: (e) => {
        if (isSseError(e)) throw new AppError(e.code, e.message, { retryable: e.retryable });
        if (e.type === "scene_ready") result = e.output as SceneOutput;
        if (e.type === "progress")
          callbacks.onSceneProgress?.(brief.index, String(e.node ?? ""), String(e.message ?? ""));
      },
    },
  );
  if (result === undefined) {
    throw new AppError("GENERATION_ERROR", "未收到 scene_ready 事件", {
      retryable: true,
    });
  }
  return result;
}

async function fetchActions(
  lesson: Lesson,
  scene: Scene,
  slide: Scene["slide"],
  script: string,
  knownSlideIds: string[],
  model: ModelConfig,
  signal: AbortSignal | undefined,
  callbacks: GenCallbacks,
): Promise<Action[]> {
  let result: Action[] | undefined;
  await postSSE(
    "/api/generate/action",
    {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      language: lesson.language,
      roles: lesson.roles,
      scene,
      slide,
      script,
      knownSlideIds,
      model,
    },
    {
      signal,
      onEvent: (e) => {
        if (isSseError(e)) throw new AppError(e.code, e.message, { retryable: e.retryable });
        if (e.type === "action_ready") result = e.actions as Action[];
        if (e.type === "progress")
          callbacks.onSceneProgress?.(scene.index, String(e.node ?? ""), String(e.message ?? ""));
      },
    },
  );
  if (result === undefined) {
    throw new AppError("GENERATION_ERROR", "未收到 action_ready 事件", {
      retryable: true,
    });
  }
  return result;
}
