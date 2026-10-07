// @spec docs/PLAN.md (Phase 1 用户自定义 Provider)
// 「测试连接」：真实调用当前 Provider 的最小请求，绝不 mock / 不 setTimeout / 不本地判断成功。
// 链路：User Config → LLM Provider(resolveModel/resolveApiKey) → 真实 API → 真实响应 → 成功/失败。
import type { NextRequest } from "next/server";
import { generate, toErrorPayload, sanitizeMessage } from "@aiclassroom/llm";
import {
  userProviderToModelConfig,
  findPreset,
  CUSTOM_PROVIDER_ID,
} from "@aiclassroom/llm/presets";
import type { UserProviderConfig } from "@aiclassroom/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  providerId?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** 探测 Provider 到底返回了什么，帮助用户定位 "Invalid JSON response" 等问题 */
async function probeProvider(baseUrl: string): Promise<{
  status: number;
  contentType: string;
  snippet: string;
}> {
  const urls = [baseUrl, `${baseUrl.replace(/\/$/, "")}/models`].filter(
    (u, i, arr) => arr.indexOf(u) === i,
  );
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = res.headers.get("content-type") ?? "unknown";
      const text = await res.text();
      const snippet = sanitizeMessage(text.slice(0, 200).replace(/\s+/g, " "));
      return { status: res.status, contentType, snippet };
    } catch {
      // 继续试下一个 probe URL
    }
  }
  return { status: 0, contentType: "unknown", snippet: "无法探测到响应内容" };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { providerId, name, apiKey, baseUrl, model } = body;

  // 服务端兜底校验（前端已校验，这里仅防绕过）
  if (!model || model.trim() === "") {
    return Response.json(
      { ok: false, code: "VALIDATION_ERROR", message: "模型不能为空", retryable: false },
      { status: 200 },
    );
  }

  const preset = providerId ? findPreset(providerId) : undefined;
  const cfg: UserProviderConfig = {
    id: "test-connection",
    providerId: providerId ?? CUSTOM_PROVIDER_ID,
    name: name ?? "测试连接",
    adapter: preset?.adapter ?? "openai-compatible",
    apiKey: apiKey ?? "",
    ...(baseUrl ? { baseUrl } : {}),
    model: model!,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const modelCfg = userProviderToModelConfig(cfg);
  const started = Date.now();

  try {
    // 真实最小请求：要求模型只回 OK。超时 30s、不重试（连接测试应快速给出结论）。
    await generate(
      modelCfg,
      { prompt: "Reply with exactly the word: OK. Do not add anything else." },
      { timeoutMs: 90_000, maxRetries: 0 },
    );
    const latencyMs = Date.now() - started;
    return Response.json({
      ok: true,
      provider: modelCfg.provider,
      model: modelCfg.modelId,
      latencyMs,
    });
  } catch (err) {
    // toErrorPayload 已对 API Key 等敏感信息做脱敏
    const payload = toErrorPayload(err);
    const message = payload.message;

    // 对 "Invalid JSON response" 做二次探测，给出更具体的诊断
    if (/invalid json|unexpected token|json parse/i.test(message) && baseUrl) {
      const probe = await probeProvider(baseUrl);
      const bodyHint = probe.snippet
        ? `响应片段：${probe.snippet}`
        : "未收到响应体";
      return Response.json(
        {
          ok: false,
          code: "PROVIDER_ERROR",
          message: `Provider 返回了非 JSON 响应（HTTP ${probe.status}，${probe.contentType}），请检查 Base URL 是否填写正确。`,
          details: bodyHint,
          retryable: false,
        },
        { status: 200 },
      );
    }

    return Response.json({ ok: false, ...payload }, { status: 200 });
  }
}
