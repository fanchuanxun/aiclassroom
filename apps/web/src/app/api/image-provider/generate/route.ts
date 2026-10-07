// @spec docs/PLAN.md (Phase 3)
// 课程 Slide 自动配图的服务端入口：只做最小图片生成，并把结果写回 Lesson。

import { AppError } from "@aiclassroom/types";
import { getLesson } from "@aiclassroom/db";
import { generateSlideImageFromActiveProvider } from "@aiclassroom/image-service";
import type { ImageGenerationResult } from "@aiclassroom/image-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  lessonId?: string;
  sceneIndex?: number;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { lessonId, sceneIndex } = body;

  if (!lessonId || typeof lessonId !== "string") {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "缺少 lessonId", retryable: false },
      { status: 200 },
    );
  }

  const index = Number(sceneIndex);
  if (!Number.isInteger(index) || index < 0) {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "sceneIndex 必须是非负整数", retryable: false },
      { status: 200 },
    );
  }

  try {
    const lesson = await getLesson(lessonId);
    if (!lesson) {
      return Response.json(
        { ok: false, code: "VALIDATION_ERROR", message: "课程不存在", retryable: false },
        { status: 200 },
      );
    }

    if (index >= lesson.scenes.length) {
      return Response.json(
        { ok: false, code: "VALIDATION_ERROR", message: "sceneIndex 超出课程场景范围", retryable: false },
        { status: 200 },
      );
    }

    const result: ImageGenerationResult = await generateSlideImageFromActiveProvider({
      lessonId,
      sceneIndex: index,
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          code: "PROVIDER_ERROR",
          message: result.error ?? "图片生成失败",
          retryable: false,
        },
        { status: 200 },
      );
    }

    return Response.json({
      ok: true,
      imageUrl: result.imageUrl,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    const appError =
      err instanceof AppError
        ? err
        : new AppError("GENERATION_ERROR", String(err), { retryable: false });
    return Response.json(
      {
        ok: false,
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
      },
      { status: 200 },
    );
  }
}
