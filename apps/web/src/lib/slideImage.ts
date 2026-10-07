// @spec docs/PLAN.md (Phase 3)
// 客户端调用图片生成服务端能力的轻量封装。

export interface CallImageGenerationInput {
  lessonId: string;
  sceneIndex: number;
}

export interface CallImageGenerationResult {
  ok: boolean;
  imageUrl?: string;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

export async function callImageGenerationApi({
  lessonId,
  sceneIndex,
}: CallImageGenerationInput): Promise<CallImageGenerationResult> {
  const res = await fetch("/api/image-provider/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lessonId, sceneIndex }),
  });

  const data = (await res.json()) as CallImageGenerationResult & { code?: string; message?: string };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      provider: data.provider ?? "unknown",
      model: data.model ?? "",
      latencyMs: data.latencyMs ?? 0,
      error: data.message ?? data.code ?? `HTTP ${res.status}`,
    };
  }

  return data;
}
