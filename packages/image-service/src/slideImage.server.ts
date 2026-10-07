// @spec docs/PLAN.md (Phase 3)
// ͼƬɷСװȡǰ Image Provider
// ѧͼ promptͼƬ APIѽд Lesson

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
      error: "ȱͼƬ API Key",
    };
  }

  const lesson = await getLesson(lessonId);
  if (lesson === undefined) {
    return {
      ok: false,
      provider: provider.adapter,
      model: provider.model,
      latencyMs: Date.now() - started,
      error: `γ̲ڣ${lessonId}`,
    };
  }

  const scene = lesson.scenes[sceneIndex];
  if (!scene?.slide) {
    return {
      ok: false,
      provider: provider.adapter,
      model: provider.model,
      latencyMs: Date.now() - started,
      error: ` ${sceneIndex + 1}  slide޷ͼ`,
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
      error: "δͼƬ Provider",
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

  const goalText = goals.slice(0, 3).join("");
  const textHints = elements
    .filter((el) => el.kind === "text" && typeof el.text === "string" && el.text.trim().length > 0)
    .map((el) => el.text as string)
    .slice(0, 3)
    .join(" / ");

  return [
    "ѧͼࡢʺϿͶӰҪɺֵͼƬ",
    `⣺${title}`,
    summary ? `Ҫ㣺${summary}` : null,
    goalText ? `ѧϰĿ꣺${goalText}` : null,
    textHints ? `ĸ${textHints}` : null,
    "ͳһɾӾϸڡ",
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

  let lastError = "δ֪";

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
        lastError = `HTTP ${res.status}${contentType || " JSON Ӧ"}`;
        continue;
      }

      const json = JSON.parse(text);
      const firstData = Array.isArray(json.data) ? json.data[0] : undefined;
      const imageUrl = firstData?.url ?? firstData?.b64_json ?? undefined;
      if (!imageUrl) {
        lastError = "ӦȱͼƬݣdata[0].url / data[0].b64_json";
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
