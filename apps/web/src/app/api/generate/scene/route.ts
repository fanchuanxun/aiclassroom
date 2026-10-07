// @spec docs/PLAN.md (Phase 1B)
// 真实 SSE 端点：Scene Agent。内部调用 runSceneAgent（真实 LLM）。
import type { NextRequest } from "next/server";
import { runSceneAgent } from "@aiclassroom/agents";
import { AppError } from "@aiclassroom/types";
import type { Language, Role } from "@aiclassroom/types";
import type { ModelConfig } from "@aiclassroom/llm";
import { createSseChannel, toSseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SceneBrief {
  id: string;
  index: number;
  total: number;
  title: string;
  summary: string;
  learningGoals: string[];
}

interface Body {
  lessonId?: string;
  lessonTitle?: string;
  lessonDescription?: string;
  topic?: string;
  language?: Language;
  roles?: Role[];
  scene?: SceneBrief;
  previousSceneTitles?: string[];
  model?: ModelConfig;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const {
    lessonTitle,
    lessonDescription,
    topic,
    language,
    roles,
    scene,
    previousSceneTitles,
    model,
  } = body;
  const channel = createSseChannel();

  void (async () => {
    try {
      if (!scene || !model || !topic) {
        throw new AppError("VALIDATION_ERROR", "缺少 scene / model / topic", {
          retryable: false,
        });
      }
      channel.send({ type: "started" });
      const result = await runSceneAgent({
        scene: {
          lessonTitle: lessonTitle ?? topic,
          lessonDescription: lessonDescription ?? "",
          topic,
          language: language ?? "zh-CN",
          roles: roles ?? [],
          scene,
          ...(previousSceneTitles ? { previousSceneTitles } : {}),
        },
        model,
        signal: req.signal,
        onEvent: (e) => {
          if (e.type === "message") {
            channel.send({ type: "progress", node: e.node, message: e.message });
          }
        },
      });
      channel.send({ type: "scene_ready", output: result.output });
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
