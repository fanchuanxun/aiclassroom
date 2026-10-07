// @spec docs/PLAN.md (Phase 3)
// 视频 Provider 的真实测试连接：最小请求，不 mock / 不 setTimeout。
import type { NextRequest } from "next/server";
import { AppError } from "@aiclassroom/types";
import type { VideoProviderConfig } from "@aiclassroom/types";
import { sanitizeMessage } from "@aiclassroom/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function videoTestPayload(model: string) {
  return {
    model,
    prompt: "A short simple test video of a book gently opening on a desk.",
  };
}

function candidateVideoCreateUrls(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const trimmed = normalized.replace(/\/v1$/, "");
  return [
    `${normalized}/videos`,
    `${trimmed}/v1/videos`,
    `${normalized}/video/generations`,
    `${trimmed}/v1/video/generations`,
    `${normalized}/images/generations`,
    `${trimmed}/v1/images/generations`,
  ].filter((u, i, arr) => arr.indexOf(u) === i);
}

export async function POST(req: NextRequest | Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { name, apiKey, baseUrl, model } = body;

  if (!model || model.trim() === "") {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "视频模型不能为空", retryable: false },
      { status: 200 },
    );
  }

  const cfg: VideoProviderConfig = {
    id: "test-video-provider",
    name: name ?? "测试视频 API",
    adapter: "openai-compatible-video",
    apiKey: apiKey ?? "",
    ...(baseUrl && baseUrl.trim() !== "" ? { baseUrl: baseUrl.trim() } : {}),
    model: model.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!cfg.apiKey) {
    return Response.json(
      { ok: false, code: "PROVIDER_ERROR", message: "请填写视频 API Key", retryable: false },
      { status: 200 },
    );
  }

  const started = Date.now();
  try {
    const urls = cfg.baseUrl ? candidateVideoCreateUrls(cfg.baseUrl) : [];
    let lastError = "未知错误";
    let lastPayload: unknown = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(videoTestPayload(cfg.model)),
        signal: AbortSignal.timeout(90_000),
      });

      lastPayload = await res.text();
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          if (res.status === 404) {
            throw new AppError(
              "PROVIDER_ERROR",
              `Video create endpoint not found: POST ${url}`,
              { retryable: false },
            );
          }
          lastError = `HTTP ${res.status}（非 JSON 响应）`;
          continue;
        }

        const json = JSON.parse(lastPayload as string);
        const created = isVideoCreateResponse(json);
        if (!created) {
          if (res.status === 404) {
            throw new AppError(
              "PROVIDER_ERROR",
              `Video create endpoint not found: POST ${url}`,
              { retryable: false },
            );
          }
          lastError = `响应不符合视频创建任务格式：${sanitizeMessage(JSON.stringify(json).slice(0, 200))}`;
          continue;
        }

        return Response.json({
          ok: true,
          provider: cfg.adapter,
          model: cfg.model,
          taskId: created.taskId ?? null,
          videoId: created.videoId ?? null,
          status: created.status ?? null,
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        lastError = sanitizeMessage(err instanceof Error ? err.message : String(err));
      }
    }

    throw new AppError(
      "PROVIDER_ERROR",
      `视频 API 测试失败：${lastError}`,
      { retryable: false },
    );
  } catch (err) {
    const appError = err instanceof AppError ? err : new AppError("PROVIDER_ERROR", String(err), { retryable: false });
    if (appError.code !== "PROVIDER_ERROR") {
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

    return Response.json(
      {
        ok: false,
        code: appError.code,
        message: sanitizeMessage(appError.message),
        details: appError.cause && typeof appError.cause === "string" && !/api_key|bearer|authorization/i.test(appError.cause)
          ? appError.cause
          : undefined,
        retryable: appError.retryable,
      },
      { status: 200 },
    );
  }
}

function isVideoCreateResponse(input: unknown): { taskId?: string; videoId?: string; status?: string } | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const taskId = typeof record.task_id === "string" ? record.task_id : typeof record.taskId === "string" ? record.taskId : undefined;
  const videoId = typeof record.video_id === "string" ? record.video_id : typeof record.videoId === "string" ? record.videoId : undefined;
  const id = typeof record.id === "string" ? record.id : undefined;
  const status = typeof record.status === "string" ? record.status : undefined;
  const validStatus = status ? /^(queued|processing|completed|failed|succeeded|running|pending)$/i.test(status) : false;
  if (taskId || videoId || id || validStatus) {
    return { taskId, videoId, status };
  }
  return undefined;
}
