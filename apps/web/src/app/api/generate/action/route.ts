// @spec docs/PLAN.md (Phase 1B)
// 真实 SSE 端点：Action Agent。内部调用 runActionAgent（真实 LLM + 运行时不变量校验）。
import type { NextRequest } from "next/server";
import { runActionAgent } from "@aiclassroom/agents";
import { AppError } from "@aiclassroom/types";
import type { Language, Role, Scene, Slide } from "@aiclassroom/types";
import type { ModelConfig } from "@aiclassroom/llm";
import { createSseChannel, toSseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  lessonId?: string;
  lessonTitle?: string;
  language?: Language;
  roles?: Role[];
  scene?: Scene;
  slide?: Slide;
  script?: string;
  knownSlideIds?: string[];
  model?: ModelConfig;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { lessonTitle, language, roles, scene, slide, script, knownSlideIds, model } =
    body;
  const channel = createSseChannel();

  void (async () => {
    try {
      if (!scene || !slide || script === undefined || !model) {
        throw new AppError("VALIDATION_ERROR", "缺少 scene / slide / script / model", {
          retryable: false,
        });
      }
      channel.send({ type: "started" });
      const result = await runActionAgent({
        input: {
          lessonTitle: lessonTitle ?? "",
          language: language ?? "zh-CN",
          roles: roles ?? [],
          scene,
          slide,
          script,
          knownSlideIds: knownSlideIds ?? [],
        },
        model,
        signal: req.signal,
        onEvent: (e) => {
          if (e.type === "message") {
            channel.send({ type: "progress", node: e.node, message: e.message });
          }
        },
      });
      channel.send({ type: "action_ready", actions: result.actions });
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
