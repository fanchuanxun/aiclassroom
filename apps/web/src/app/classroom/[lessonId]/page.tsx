// @spec docs/PLAN.md (Phase 1C) / docs/RUNTIME.md §2
// 课堂 Runtime 的 UI 落地：幻灯片 + 字幕 + 角色 + 播放控制 + 交互面板。
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Input } from "@aiclassroom/ui";
import { cn } from "@aiclassroom/ui";
import type { InteractAnswer } from "@aiclassroom/runtime";
import type { Action } from "@aiclassroom/types";
import { useLesson } from "@/lib/useLesson";
import { useClassroom } from "@/lib/classroom/useClassroom";
import { SlideView } from "@/components/SlideView";
import { RoleChip } from "@/components/RoleChip";
import { Nav } from "@/components/Nav";

export default function ClassroomPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId!;
  const lesson = useLesson(lessonId);
  const api = useClassroom(lesson ?? FALLBACK_LESSON);

  if (!lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        正在加载课程…
      </div>
    );
  }

  const { state, currentAction, currentRole, currentSlide, subtitle, focusElementId, interact, controls, submitInteract } = api;
  const isPlaying = state.status === "playing";
  const isPaused = state.status === "paused";
  const isWaiting = state.status === "waiting_for_user";
  const isFinished = state.status === "finished";
  const isError = state.status === "error";

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <Nav />
      <div className="flex flex-1 overflow-hidden">
        {/* 主舞台 */}
        <main className="relative flex flex-1 flex-col p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">
                场景 {state.currentSceneIndex + 1} / {lesson.scenes.length}
              </div>
              <div className="text-lg font-semibold">
                {lesson.scenes[state.currentSceneIndex]?.title ?? lesson.title}
              </div>
            </div>
            <StatusBadge status={state.status} />
          </div>

          <div className="relative min-h-0 flex-1">
            <SlideView slide={currentSlide} focusElementId={focusElementId} />
          </div>

          {/* 字幕 / 当前发言 */}
          <div className="mt-4 min-h-[64px] rounded-xl bg-slate-800/80 px-4 py-3">
            {currentRole ? (
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <span>{currentRole.avatarUrl}</span>
                <span className="font-medium" style={{ color: currentRole.color }}>
                  {currentRole.name}
                </span>
                {currentAction?.type === "SPEECH" ? (
                  <span className="rounded bg-slate-700 px-1.5 py-0.5">讲解</span>
                ) : null}
              </div>
            ) : null}
            <p className="text-[15px] leading-relaxed text-slate-100">
              {subtitle || "（准备中…）"}
            </p>
          </div>

          {/* 播放控制 */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {(state.status === "idle") ? (
              <Button onClick={controls.play}>▶ 开始上课</Button>
            ) : isPlaying ? (
              <Button onClick={controls.pause}>⏸ 暂停</Button>
            ) : isPaused ? (
              <Button onClick={controls.resume}>▶ 继续</Button>
            ) : null}
            {isPlaying || isPaused ? (
              <>
                <Button variant="outline" onClick={controls.next}>
                  ⏭ 下一步
                </Button>
                <Button variant="outline" onClick={controls.stop}>
                  ⏹ 停止
                </Button>
              </>
            ) : null}
            {isFinished ? (
              <Button onClick={controls.play}>↻ 重新播放</Button>
            ) : null}

            <div className="ml-3 flex items-center gap-1 text-xs">
              {[0.5, 1, 1.5, 2].map((r) => (
                <button
                  key={r}
                  onClick={() => controls.setRate(r as 0.5 | 1 | 1.5 | 2)}
                  className={cn(
                    "rounded px-2 py-1",
                    state.playbackRate === r
                      ? "bg-white text-slate-900"
                      : "bg-slate-700 text-slate-300",
                  )}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          {isError ? (
            <div className="mt-3 rounded-lg border border-rose-500/50 bg-rose-950/60 px-4 py-2 text-sm text-rose-200">
              课堂出现错误：
              {state.errors[state.errors.length - 1]?.message}
            </div>
          ) : null}

          {isFinished ? (
            <div className="mt-3 text-center text-sm text-emerald-300">
              🎉 课程已结束。可在「课程库」中再次打开或回放。
            </div>
          ) : null}
        </main>

        {/* 侧栏：角色 + 场景导航 */}
        <aside className="hidden w-72 shrink-0 border-l border-slate-800 bg-slate-900 p-4 md:block">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            课堂角色
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {lesson.roles.map((r) => (
              <RoleChip
                key={r.id}
                role={r}
                active={currentRole?.id === r.id}
              />
            ))}
          </div>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            场景
          </h3>
          <div className="mt-2 space-y-1">
            {lesson.scenes.map((s, i) => {
              const ready = s.slide !== undefined && s.actions.length > 0;
              return (
                <button
                  key={s.id}
                  disabled={!ready}
                  onClick={() => controls.gotoScene(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    i === state.currentSceneIndex
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-800",
                    !ready && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="text-xs text-slate-500">{i + 1}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4">
            <Link
              href={`/studio/${lessonId}`}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ← 返回工作室
            </Link>
          </div>
        </aside>
      </div>

      {/* 交互面板（INTERACT 动作触发） */}
      {interact ? (
        <InteractPanel
          action={interact.action}
          onSubmit={(ans) => submitInteract(ans)}
        />
      ) : null}

      {isWaiting && !interact ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-sm text-white shadow-lg">
          等待用户操作…
        </div>
      ) : null}
    </div>
  );
}

const FALLBACK_LESSON = {
  id: "x",
  title: "",
  description: "",
  topic: "",
  language: "zh-CN" as const,
  createdAt: "",
  updatedAt: "",
  status: "outlining" as const,
  roles: [],
  scenes: [],
  meta: { difficulty: "beginner" as const, estimatedDurationMin: 1 },
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    idle: "空闲",
    loading: "加载中",
    ready: "就绪",
    playing: "播放中",
    paused: "已暂停",
    waiting_for_user: "等待用户",
    error: "错误",
    finished: "已结束",
  };
  return (
    <span className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200">
      {map[status] ?? status}
    </span>
  );
}

function InteractPanel({
  action,
  onSubmit,
}: {
  action: Extract<Action, { type: "INTERACT" }>;
  onSubmit: (ans: InteractAnswer) => void;
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [text, setText] = React.useState("");

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const submit = () => {
    const ans: InteractAnswer = {
      submittedAt: new Date().toISOString(),
      ...(selected.length > 0 ? { choiceIds: selected } : {}),
      ...(text.trim() ? { text: text.trim() } : {}),
    };
    onSubmit(ans);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-800 p-5 shadow-2xl">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 text-xs uppercase tracking-wide text-amber-400">
          {action.kind === "quiz"
            ? "测验"
            : action.kind === "poll"
              ? "投票"
              : action.kind === "code"
                ? "编程练习"
                : "提问"}
        </div>
        <p className="mb-3 text-base text-slate-100">{action.prompt}</p>

        {action.choices && action.choices.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {action.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  selected.includes(c.id)
                    ? "border-amber-400 bg-amber-400/10 text-white"
                    : "border-slate-600 text-slate-200 hover:border-slate-400",
                )}
              >
                {c.text}
              </button>
            ))}
          </div>
        ) : (
          <Input
            className="bg-slate-900"
            placeholder="输入你的回答…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={selected.length === 0 && !text.trim()}>
            提交
          </Button>
        </div>
      </div>
    </div>
  );
}
