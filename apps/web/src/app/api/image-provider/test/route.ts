// @spec docs/PLAN.md (Phase 3)
// 图片 Provider 的真实测试连接：最小请求，不 mock / 不 setTimeout。
import type { NextRequest } from "next/server";
import { AppError } from "@aiclassroom/types";
import type { ImageProviderConfig } from "@aiclassroom/types";
import { sanitizeMessage } from "@aiclassroom/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function imageTestPayload(model: string) {
  return {
    model,
    prompt: "a tiny clean icon of a book",
    size: "256x256",
    n: 1,
  };
}

function candidateImageUrls(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const trimmed = normalized.replace(/\/v1$/, "");
  return [
    `${normalized}/images/generations`,
    `${trimmed}/v1/images/generations`,
    `${normalized.replace(/\/chat\/completions$/, "")}/images/generations`,
  ].filter((u, i, arr) => arr.indexOf(u) === i);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { name, apiKey, baseUrl, model } = body;

  if (!model || model.trim() === "") {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "图片模型不能为空", retryable: false },
      { status: 200 },
    );
  }

  const cfg: ImageProviderConfig = {
    id: "test-image-provider",
    name: name ?? "测试图片 API",
    adapter: "openai-compatible-images",
    apiKey: apiKey ?? "",
    ...(baseUrl && baseUrl.trim() !== "" ? { baseUrl: baseUrl.trim() } : {}),
    model: model.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!cfg.apiKey) {
    return Response.json(
      { ok: false, code: "PROVIDER_ERROR", message: "请填写图片 API Key", retryable: false },
      { status: 200 },
    );
  }

  const started = Date.now();
  try {
    const urls = cfg.baseUrl ? candidateImageUrls(cfg.baseUrl) : [];
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
          body: JSON.stringify(imageTestPayload(cfg.model)),
          signal: AbortSignal.timeout(90_000),
        });

        lastPayload = await res.text();
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("json")) {
          lastError = `HTTP ${res.status}（${contentType || "非 JSON 响应"}）`;
          continue;
        }

        const json = JSON.parse(lastPayload as string);
        const firstData = Array.isArray(json.data) ? json.data[0] : undefined;
        const imageUrl =
          firstData?.url ?? firstData?.b64_json ?? undefined;
        if (!imageUrl) {
          lastError = "响应缺少图片数据（data[0].url / data[0].b64_json）";
          continue;
        }

        return Response.json({
          ok: true,
          provider: cfg.adapter,
          model: cfg.model,
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        lastError = sanitizeMessage(err instanceof Error ? err.message : String(err));
      }
    }

    throw new AppError(
      "PROVIDER_ERROR",
      `图片 API 测试失败：${lastError}`,
      { retryable: false },
    );
  } catch (err) {
    const appError = err instanceof AppError ? err : new AppError("PROVIDER_ERROR", String(err), { retryable: false });
    return Response.json(
      {
        ok: false,
        code: appError.code,
        message: sanitizeMessage(appError.message),
        details: typeof appError.cause === "string" ? (appError.cause as string) : undefined,
        retryable: appError.retryable,
      },
      { status: 200 },
    );
  }
}
