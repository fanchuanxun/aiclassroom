// @spec docs/PLAN.md (Phase 3)
// 图片生成服务端能力的最小封装：读取当前 Image Provider、
// 构造教学配图 prompt、调用图片 API，并把结果写回 Lesson。

import { getActiveImageProvider, getLesson, saveLesson } from "@aiclassroom/db";
import { sanitizeMessage } from "@aiclassroom/llm";

export interface ImageGenerationInput {
  lessonId: string;
  sceneIndex: number;
  provider: {
    adapter: string;
    apiKey: string;
    baseUrl?: string;
    model: string;
  };
}

export interface ImageGenerationResult {
  ok: boolean;
  imageUrl?: string;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

export async function generateSlideImage({
  lessonId,
  sceneIndex,
  provider,
}: ImageGenerationInput): Promise<ImageGenerationResult> {
  const started = Date.now();
  if (!provider.apiKey) {
    return {
      ok: false,
      provider: provider.adapter,
      model: provider.model,
      latencyMs: Date.now() - started,
      error: "缺少图片 API Key",
    };
  }

  const lesson = await getLesson(lessonId);
  if (lesson === undefined) {
    return {
      ok: false,
      provider: provider.adapter,
      model: provider.model,
      latencyMs: Date.now() - started,
      error: `课程不存在：${lessonId}`,
    };
  }

  const scene = lesson.scenes[sceneIndex];
  if (!scene?.slide) {
    return {
      ok: false,
      provider: provider.adapter,
      model: provider.model,
      latencyMs: Date.now() - started,
      error: `场景 ${sceneIndex + 1} 暂无 slide，无法生成配图`,
    };
  }

  const prompt = buildImagePrompt(scene as Record<string, unknown>);
  const result = await callImageProvider(provider, prompt);

  if (result.ok && result.imageUrl) {
    const updated = {
      ...lesson,
      updatedAt: new Date().toISOString(),
      scenes: lesson.scenes.map((s, idx) =>
        idx === sceneIndex
          ? {
              ...s,
              slide: {
                ...s.slide,
                imageUrl: result.imageUrl,
              },
            }
          : s,
      ),
    } as Parameters<typeof saveLesson>[0];
    await saveLesson(updated);
  }

  return {
    ...result,
    latencyMs: Date.now() - started,
  };
}

export async function generateSlideImageFromActiveProvider({
  lessonId,
  sceneIndex,
}: {
  lessonId: string;
  sceneIndex: number;
}): Promise<ImageGenerationResult> {
  const provider = await getActiveImageProvider();
  if (!provider) {
    return {
      ok: false,
      provider: "none",
      model: "",
      latencyMs: 0,
      error: "尚未启用图片 Provider",
    };
  }

  return generateSlideImage({
    lessonId,
    sceneIndex,
    provider: {
      adapter: provider.adapter,
      apiKey: provider.apiKey,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      model: provider.model,
    },
  });
}

function buildImagePrompt(scene: Record<string, unknown>): string {
  const slide = scene.slide as Record<string, unknown> | undefined;
  const title = typeof scene.title === "string" ? scene.title : "";
  const summary = typeof scene.summary === "string" ? scene.summary : "";
  const goals: string[] = Array.isArray(scene.learningGoals)
    ? scene.learningGoals.filter((item): item is string => typeof item === "string")
    : [];
  const elements: Array<Record<string, unknown>> = Array.isArray(slide?.elements)
    ? slide.elements
    : [];

  const goalText = goals.slice(0, 3).join("；");
  const textHints = elements
    .filter((el) => el.kind === "text" && typeof el.text === "string" && el.text.trim().length > 0)
    .map((el) => el.text as string)
    .slice(0, 3)
    .join(" / ");

  return [
    "教学配图，简洁、适合课堂投影，不要生成含大量文字的图片。",
    `主题：${title}`,
    summary ? `要点：${summary}` : null,
    goalText ? `学习目标：${goalText}` : null,
    textHints ? `核心概念：${textHints}` : null,
    "风格统一、背景干净、视觉焦点清晰、避免干扰性细节。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function callImageProvider(
  provider: ImageGenerationInput["provider"],
  prompt: string,
): Promise<ImageGenerationResult> {
  const trimmedBase = provider.baseUrl?.replace(/\/+$/, "").replace(/\/v1$/, "") ?? "";
  const urls = [
    ...(provider.baseUrl ? [`${provider.baseUrl.replace(/\/+$/, "")}/images/generations`] : []),
    ...(trimmedBase ? [`${trimmedBase}/v1/images/generations`] : []),
  ];

  let lastError = "未知错误";

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          prompt,
          size: "1024x1024",
          n: 1,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!res.ok || !contentType.includes("json")) {
        lastError = `HTTP ${res.status}（${contentType || "非 JSON 响应"}）`;
        continue;
      }

      const json = JSON.parse(text);
      const firstData = Array.isArray(json.data) ? json.data[0] : undefined;
      const imageUrl = firstData?.url ?? firstData?.b64_json ?? undefined;
      if (!imageUrl) {
        lastError = "响应缺少图片数据（data[0].url / data[0].b64_json）";
        continue;
      }

      return {
        ok: true,
        imageUrl,
        provider: provider.adapter,
        model: provider.model,
        latencyMs: 0,
      };
    } catch (err) {
      lastError = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    ok: false,
    provider: provider.adapter,
    model: provider.model,
    latencyMs: 0,
    error: lastError,
  };
}
