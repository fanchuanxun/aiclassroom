// @spec docs/RUNTIME.md §3 / docs/ARCHITECTURE.md (Executor Registry)
// 每种 Action 对应一个 executor，注册到 EXECUTORS 表。
// 不把分支堆在 Classroom.tsx，也不堆 if/else if/else。

import type { Action, ActionType } from "@aiclassroom/types";
import type { Executor, ExecutorContext } from "./types";

function speechOptions(ctx: ExecutorContext, roleId: string | undefined) {
  const voice = ctx.roleOf(roleId)?.voice;
  return {
    ...(voice?.rate === undefined ? {} : { rate: voice.rate }),
    ...(voice?.pitch === undefined ? {} : { pitch: voice.pitch }),
    ...(voice?.voiceURI === undefined ? {} : { voiceURI: voice.voiceURI }),
    ...(voice?.lang === undefined ? {} : { lang: voice.lang }),
  };
}

async function execSlide(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "SLIDE") return;
  ctx.deps.showSlide(action.slideId);
}

async function execSpeech(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "SPEECH") return;
  await ctx.deps.speak(
    action.roleId ?? "",
    action.text,
    speechOptions(ctx, action.roleId),
    ctx.signal,
  );
}

async function execFocus(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "FOCUS") return;
  ctx.deps.focusElement(action.elementId);
  await ctx.deps.wait(action.durationMs, ctx.signal);
}

async function execWrite(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "WRITE") return;
  ctx.deps.drawWhiteboard(action.strokes);
  await ctx.deps.wait(action.speedMs, ctx.signal);
}

async function execWait(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "WAIT") return;
  await ctx.deps.wait(action.durationMs, ctx.signal);
}

async function execInteract(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "INTERACT") return;
  ctx.waitForUser();
  await ctx.deps.promptInteract(action);
}

async function execDiscuss(action: Action, ctx: ExecutorContext): Promise<void> {
  if (action.type !== "DISCUSS") return;
  await ctx.deps.runDiscuss(action);
}

export const EXECUTORS: Record<ActionType, Executor> = {
  SLIDE: execSlide,
  SPEECH: execSpeech,
  FOCUS: execFocus,
  WRITE: execWrite,
  WAIT: execWait,
  INTERACT: execInteract,
  DISCUSS: execDiscuss,
};
