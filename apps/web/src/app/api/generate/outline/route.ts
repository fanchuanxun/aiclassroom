// @spec docs/PLAN.md (Phase 1B)
// 真实 SSE 端点：Outline Agent。内部调用 runOutlineAgent（真实 LLM）。
import type { NextRequest } from "next/server";
import { runOutlineAgent } from "@aiclassroom/agents";
import { AppError } from "@aiclassroom/types";
import type { Language, Role } from "@aiclassroom/types";
import type { ModelConfig } from "@aiclassroom/llm";
import { createSseChannel, toSseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  topic?: string;
  language?: Language;
  roles?: Role[];
  sceneCount?: number;
  model?: ModelConfig;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { topic, language, roles, sceneCount, model } = body;
  const channel = createSseChannel();

  void (async () => {
    try {
      if (!topic || !model) {
        throw new AppError("VALIDATION_ERROR", "缺少 topic 或 model", {
          retryable: false,
        });
      }
      channel.send({ type: "started" });
      const result = await runOutlineAgent({
        topic,
        language: language ?? "zh-CN",
        roles: roles ?? [],
        ...(sceneCount ? { sceneCount } : {}),
        model,
        signal: req.signal,
        onEvent: (e) => {
          if (e.type === "message") {
            channel.send({ type: "progress", node: e.node, message: e.message });
          }
        },
      });
      channel.send({ type: "outline_ready", outline: result.outline });
      channel.send({ type: "done" });
    } catch (err) {
      const appError =
        err instanceof AppError
          ? err
          : new AppError("GENERATION_ERROR", String(err), { retryable: false });
      channel.send({
        type: "error",
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
      });
    } finally {
      channel.close();
    }
  })();

  return toSseResponse(channel);
}
