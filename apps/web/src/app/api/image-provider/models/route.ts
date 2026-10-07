// @spec docs/PLAN.md (Phase 3)
// 图片 Provider 的模型列表拉取：复用现有 Provider 配置结构，
// 真实请求图片 API 的 models 端点，并把可用模型返回前端。

import { sanitizeMessage } from "@aiclassroom/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  apiKey?: string;
  baseUrl?: string;
}

interface ModelInfo {
  id: string;
  owned_by?: string;
}

function candidateModelUrls(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const trimmed = normalized.replace(/\/v1$/, "");
  return [
    `${normalized}/models`,
    `${trimmed}/v1/models`,
    `${normalized.replace(/\/chat\/completions$/, "")}/models`,
  ].filter((u, i, arr) => arr.indexOf(u) === i);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { apiKey, baseUrl } = body;

  if (!baseUrl || baseUrl.trim() === "") {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "请先填写 Base URL", retryable: false },
      { status: 200 },
    );
  }

  const urls = candidateModelUrls(baseUrl.trim());
  let lastError = "未知错误";

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...(apiKey && apiKey.trim() !== "" ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("json")) {
        lastError = `HTTP ${res.status}（${contentType || "非 JSON 响应"}）`;
        continue;
      }
      const json = (await res.json()) as { data?: ModelInfo[]; models?: ModelInfo[] };
      const list = json.data ?? json.models ?? [];
      const ids = list.map((m) => m.id).filter((id): id is string => typeof id === "string");
      if (ids.length === 0) {
        lastError = "该端点未返回模型列表";
        continue;
      }
      return Response.json({
        ok: true,
        models: ids.sort((a, b) => a.localeCompare(b)),
      });
    } catch (err) {
      lastError = sanitizeMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return Response.json(
    { ok: false, code: "PROVIDER_ERROR", message: `拉取图片模型失败：${lastError}`, retryable: false },
    { status: 200 },
  );
}
