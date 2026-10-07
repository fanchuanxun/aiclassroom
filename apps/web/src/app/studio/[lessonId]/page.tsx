// @spec docs/PLAN.md (Phase 1B / 渐进式进入课堂)
// 生成工作室：实时展示 Outline → 各 Scene 的 slide / action 生成进度。
// Scene 0 就绪即可「进入课堂」（后台继续生成后续场景）。
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@aiclassroom/ui";
import { AppError, type OutlineOutput, type Scene } from "@aiclassroom/types";
import { useLesson } from "@/lib/useLesson";
import { useUserProviders, activeProvider, activeModelConfig } from "@/lib/userProviders";
import { useImageProviders } from "@/lib/imageProviders";
import type { ImageProviderConfig } from "@aiclassroom/types";
import {
  generateLesson,
  type GenCallbacks,
} from "@/lib/gen/controller";
import { Nav } from "@/components/Nav";

interface SceneState {
  status: Scene["status"];
  slideReady: boolean;
  actionsReady: boolean;
  imageReady: boolean;
  /** 当前流水线节点进度（如「正在生成幻灯片与讲稿…」），用于暴露卡点 */
  node?: string;
}

export default function StudioPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId!;
  const router = useRouter();
  const { providers, load, loaded } = useUserProviders();
  const imageProviders = useImageProviders().providers;
  const activeImageRef = React.useRef<ImageProviderConfig | undefined>(undefined);
  const lesson = useLesson(lessonId);
  const active = activeProvider(providers);
  const model = activeModelConfig(providers);

  React.useEffect(() => {
    void load();
  }, [load]);

  const [outline, setOutline] = React.useState<OutlineOutput | null>(null);
  const [scenes, setScenes] = React.useState<SceneState[]>([]);
  const [firstReady, setFirstReady] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<{
    code: string;
    message: string;
    retryable: boolean;
  } | null>(null);
  /** Outline 流水线当前节点消息（卡点可见） */
  const [outlineNode, setOutlineNode] = React.useState<string>("");
  /** 已等待秒数（让用户立刻看到「卡了多久」，而非误以为无响应） */
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [imageError, setImageError] = React.useState<string | null>(null);

  const startedRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const lessonRef = React.useRef(lesson);
  lessonRef.current = lesson;
  activeImageRef.current = imageProviders.find((p) => p.enabled);

  React.useEffect(() => {
    if (!lessonRef.current || startedRef.current) return;

    // 等待 useUserProviders 从 IndexedDB 异步加载完成，避免第一次 render 时 model 为 undefined 就误判为无 Provider。
    if (!loaded) return;

    if (!model) {
      setError({
        code: "PROVIDER_ERROR",
        message: "尚未配置任何可用的 Provider，请先到「设置」中添加并设为当前使用。",
        retryable: false,
      });
      return;
    }

    startedRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;

    // 整体生成超时：超过 8 分钟仍未全部完成，主动中断并给出明确错误，避免无限转圈。
    const TOTAL_TIMEOUT_MS = 8 * 60 * 1000;
    const totalTimer = setTimeout(() => {
      ac.abort(
        new AppError(
          "TIMEOUT",
          `生成超时：已超过 ${TOTAL_TIMEOUT_MS / 1000} 秒仍未全部完成。通常是模型/网络不稳定（如 hubway 偶发挂起）。建议：换用更快的模型（如 gpt-5.5）、减少场景数、或重试。`,
          { retryable: true },
        ),
      );
    }, TOTAL_TIMEOUT_MS);

    // 已等待计时：让用户立刻看到「卡了多久」，而非误以为无响应。
    const startedAtMs = Date.now();
    const tick = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    setElapsedSec(0);

    const callbacks: GenCallbacks = {
      onOutline: (o) => {
        setOutline(o);
        setImageError(null);
        setScenes(
          o.scenes.map(() => ({
            status: "pending",
            slideReady: false,
            actionsReady: false,
            imageReady: false,
          })),
        );
      },
      onOutlineProgress: (_node, message) => setOutlineNode(message),
      onSceneStatus: (i, status) =>
        setScenes((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status } : s)),
        ),
      onSceneSlide: (i) =>
        setScenes((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, slideReady: true } : s)),
        ),
      onSceneImage: (i) =>
        setScenes((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, imageReady: true } : s)),
        ),
      onSceneActions: (i) =>
        setScenes((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, actionsReady: true } : s,
          ),
        ),
      onSceneProgress: (i, _node, message) =>
        setScenes((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, node: message } : s)),
        ),
      onFirstSceneReady: () => setFirstReady(true),
      onError: (e) => setError(e),
      onDone: () => setDone(true),
    };

    generateLesson({
      lessonId,
      model,
      signal: ac.signal,
      callbacks,
    }).catch((err) => {
      // 用户离开 / 路由变化导致的中断（无原因）属正常，不展示为生成失败。
      // 超时中断带 AppError 原因，需明确告知用户（而非继续无限转圈）。
      if (err instanceof DOMException && err.name === "AbortError") {
        const reason = ac.signal.reason;
        if (reason instanceof AppError) {
          setError({
            code: reason.code,
            message: reason.message,
            retryable: !!reason.retryable,
          });
        }
        return;
      }
      setError({
        code: "GENERATION_ERROR",
        message: String(err),
        retryable: false,
      });
    });

    return () => {
      clearTimeout(totalTimer);
      clearInterval(tick);
      ac.abort();
    };
    // 依赖稳定的原始标识，避免 model 对象每次 render 都是新引用导致 effect 重跑、signal 被误 abort。
  }, [lesson?.id, loaded, active?.id]);

  const overallStatus = lesson?.status ?? "outlining";

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {lesson?.title ?? "正在准备课程…"}
            </h1>
          <p className="mt-1 text-sm text-slate-500">
            状态：{overallStatus}
            {done ? " · 全部生成完成" : ""}
          </p>
          {active ? (
            <p className="mt-1 text-xs text-slate-400">
              正在使用：{active.name} · {active.model}
              {active.apiKey ? "（你的 API Key）" : "（服务端环境变量 Key）"}
            </p>
          ) : null}
          </div>
          <Button
            disabled={!firstReady}
            onClick={() => router.push(`/classroom/${lessonId}`)}
          >
            {firstReady ? "进入课堂 →" : "场景生成中…"}
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong>{error.code}</strong>：{error.message}
            {error.retryable ? "（可重试）" : ""}
          </div>
        ) : null}

        {imageError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {imageError}
          </div>
        ) : null}

        {outline ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">课程大纲</h2>
            <p className="mt-1 text-xs text-slate-400">
              {outline.scenes.length} 个场景 · 预计 {outline.estimatedDurationMin} 分钟
            </p>
            <ol className="mt-3 space-y-2">
              {outline.scenes.map((s, i) => {
                const st = scenes[i];
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 p-3"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {s.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {s.summary}
                      </div>
                      {st?.node ? (
                        <div className="mt-1 text-[11px] text-slate-400">
                          {st.node}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                        <Step done={st?.slideReady} label="幻灯片" />
                        <Step done={st?.actionsReady} label="教学动作" />
                        <Step done={st?.imageReady} label="配图" />
                        <Step
                          done={
                            st?.status === "ready" || st?.status === "failed"
                          }
                          label={
                            st?.status === "failed"
                              ? "生成失败"
                              : st?.status === "generating"
                                ? "生成中"
                                : "待生成"
                          }
                          danger={st?.status === "failed"}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>{outlineNode || "正在调用 Outline Agent 生成大纲…"}</span>
              <span className="shrink-0 text-xs text-slate-400">
                已等待 {elapsedSec}s
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
            返回主页
          </Link>
        </div>
      </main>
    </div>
  );
}

function Step({
  done,
  label,
  danger = false,
}: {
  done?: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 " +
        (danger
          ? "bg-rose-100 text-rose-700"
          : done
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-500")
      }
    >
      {done || danger ? "●" : "○"} {label}
    </span>
  );
}
