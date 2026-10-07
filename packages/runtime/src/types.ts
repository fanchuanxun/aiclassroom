// @spec docs/RUNTIME.md §2 / docs/PLAN.md (Phase 1C)
// 播放引擎与执行器解耦的核心类型。引擎本身不渲染 UI，只通过 RuntimeDeps
// 把「朗读 / 展示幻灯片 / 聚焦 / 白板 / 交互 / 讨论」下发给具体实现（React 层）。

import type {
  Action,
  Lesson,
  PlaybackRate,
  Role,
  Stroke,
} from "@aiclassroom/types";

/** 用户在 INTERACT 动作中的作答 */
export interface InteractAnswer {
  choiceIds?: string[];
  text?: string;
  submittedAt: string;
}

/**
 * 引擎依赖的外部能力。Web 层用 Web Speech + React 状态实现；
 * 测试层用桩实现。引擎不直接调用浏览器 API。
 */
export interface RuntimeDeps {
  /** 朗读角色台词；resolve = 播报完成（或 signal 中止取消）。 */
  speak(
    roleId: string,
    text: string,
    opts: { rate?: number; pitch?: number; voiceURI?: string; lang?: string },
    signal?: AbortSignal,
  ): Promise<void>;
  /** 展示某张幻灯片（undefined = 当前场景默认 slide）。 */
  showSlide(slideId: string | undefined): void;
  /** 聚焦幻灯片元素（FOCUS 用）。 */
  focusElement(elementId: string): void;
  /** 白板绘制（WRITE 用）。 */
  drawWhiteboard(strokes: Stroke[]): void;
  /** 交互动作：展示题目并 resolve 用户作答；引擎会先进入 waiting_for_user。 */
  promptInteract(action: Extract<Action, { type: "INTERACT" }>): Promise<InteractAnswer>;
  /** 多 Agent 讨论（DISCUSS 用）。 */
  runDiscuss(action: Extract<Action, { type: "DISCUSS" }>): Promise<void>;
  /** 受控等待（WAIT / FOCUS 计时），signal 中止时立即 resolve。 */
  wait(ms: number, signal: AbortSignal): Promise<void>;
}

/** 单个 Action 执行时的上下文。 */
export interface ExecutorContext {
  deps: RuntimeDeps;
  lesson: Lesson;
  roleOf(roleId: string | undefined): Role | undefined;
  signal: AbortSignal;
  /** 标记为「等待用户」，引擎状态转为 waiting_for_user。 */
  waitForUser(): void;
}

export type Executor = (action: Action, ctx: ExecutorContext) => Promise<void>;

export type { PlaybackRate };
