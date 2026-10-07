// @spec docs/RUNTIME.md §2 / docs/PLAN.md (Phase 1C)
// Classroom Runtime 核心：状态机 + Action 执行循环。
// 引擎不感知 UI；所有媒体能力通过 RuntimeDeps 下发。可独立单测。

import { AppError } from "@aiclassroom/types";
import type {
  Action,
  Lesson,
  PlaybackError,
  PlaybackRate,
  PlaybackState,
  PlaybackStatus,
  Role,
} from "@aiclassroom/types";
import { EXECUTORS } from "./executors";
import type { ExecutorContext, RuntimeDeps } from "./types";

export interface PlayerOptions {
  lesson: Lesson;
  deps: RuntimeDeps;
}

type StateListener = (state: PlaybackState) => void;
type ActionListener = (action: Action | null, role: Role | undefined) => void;

function initialState(): PlaybackState {
  return {
    status: "idle",
    currentSceneIndex: 0,
    currentActionIndex: 0,
    elapsedMs: 0,
    playbackRate: 1,
    errors: [],
  };
}

export class Player {
  private lesson: Lesson;
  private readonly deps: RuntimeDeps;
  private state: PlaybackState = initialState();
  private readonly stateListeners = new Set<StateListener>();
  private readonly actionListeners = new Set<ActionListener>();
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private currentAbort: AbortController | null = null;
  private startMs = 0;

  constructor(options: PlayerOptions) {
    this.lesson = options.lesson;
    this.deps = options.deps;
  }

  // ---- 订阅 ----
  getState(): PlaybackState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /** 当前正在执行（或刚完成）的 Action 变化回调。null 表示课堂结束。 */
  onAction(listener: ActionListener): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  setRate(rate: PlaybackRate): void {
    this.state = { ...this.state, playbackRate: rate };
    this.emitState();
  }

  /**
   * 播放过程中替换 lesson（如后台生成的新场景注入）。
   * 循环每轮都从 this.lesson 读取最新数据，因此新增场景会被自动纳入。
   * 当前播放位置（scene/action 索引）保持不变。
   */
  setLesson(lesson: Lesson): void {
    this.lesson = lesson;
    this.emitState();
  }

  // ---- 控制 ----
  async play(): Promise<void> {
    if (this.state.status === "playing") return;
    if (this.state.status === "finished") {
      this.state = initialState();
      this.emitState();
    }
    this.running = true;
    this.setStatus("playing");
    if (this.loopPromise === null) {
      this.loopPromise = this.loop()
        .catch(() => undefined)
        .finally(() => {
          this.loopPromise = null;
        });
    }
  }

  pause(): void {
    if (this.state.status !== "playing" && this.state.status !== "waiting_for_user") {
      return;
    }
    this.running = false;
    this.currentAbort?.abort();
    this.setStatus("paused");
  }

  resume(): void {
    if (this.state.status !== "paused") return;
    void this.play();
  }

  /** 跳过当前 Action，进入下一个（暂停态，等待用户继续）。 */
  next(): void {
    this.running = false;
    this.currentAbort?.abort();
    this.advance();
    this.setStatus("paused");
  }

  /** 跳转到指定场景起点（暂停态）。 */
  gotoScene(index: number): void {
    if (index < 0 || index >= this.lesson.scenes.length) return;
    this.running = false;
    this.currentAbort?.abort();
    this.state = {
      ...this.state,
      currentSceneIndex: index,
      currentActionIndex: 0,
    };
    this.setStatus("paused");
    this.emitState();
  }

  stop(): void {
    this.running = false;
    this.currentAbort?.abort();
    this.state = initialState();
    this.emitState();
  }

  // ---- 内部循环 ----
  private async loop(): Promise<void> {
    this.startMs = Date.now();
    while (this.running) {
      const scene = this.lesson.scenes[this.state.currentSceneIndex];
      if (scene === undefined) {
        this.finish();
        return;
      }
      // 进入场景默认展示该场景 slide
      this.setStatus("playing");
      this.deps.showSlide(scene.slide?.id);

      const action = scene.actions[this.state.currentActionIndex];
      if (action === undefined) {
        // 场景内动作播完，进入下一场景
        this.state = {
          ...this.state,
          currentSceneIndex: this.state.currentSceneIndex + 1,
          currentActionIndex: 0,
        };
        this.emitState();
        continue;
      }

      this.emitAction(action);
      const ac = new AbortController();
      this.currentAbort = ac;
      try {
        await this.runAction(action, ac.signal);
        // 执行成功才推进索引
        this.advance();
      } catch (error) {
        if (!this.running) {
          // 被暂停/停止：保留当前索引，等待 resume 重放同一动作
          this.currentAbort = null;
          return;
        }
        this.fail(error);
        this.running = false;
        return;
      }
      this.currentAbort = null;
    }
  }

  private async runAction(action: Action, signal: AbortSignal): Promise<void> {
    const ctx: ExecutorContext = {
      deps: this.deps,
      lesson: this.lesson,
      roleOf: (id) => this.roleOf(id),
      signal,
      waitForUser: () => this.setStatus("waiting_for_user"),
    };
    await EXECUTORS[action.type](action, ctx);
    // 执行器可能因 signal 中止而提前 resolve（如受控 wait / 被暂停打断）。
    // 此时必须抛错，避免被误判为「动作完成」而推进索引。
    if (signal.aborted) {
      throw new Error("action aborted by signal");
    }
  }

  private advance(): void {
    const scene = this.lesson.scenes[this.state.currentSceneIndex];
    if (scene === undefined) {
      this.finish();
      return;
    }
    const nextIndex = this.state.currentActionIndex + 1;
    if (nextIndex >= scene.actions.length) {
      this.state = {
        ...this.state,
        currentSceneIndex: this.state.currentSceneIndex + 1,
        currentActionIndex: 0,
        elapsedMs: Date.now() - this.startMs,
      };
    } else {
      this.state = {
        ...this.state,
        currentActionIndex: nextIndex,
        elapsedMs: Date.now() - this.startMs,
      };
    }
    this.emitState();
  }

  private finish(): void {
    this.running = false;
    this.state = { ...this.state, status: "finished", elapsedMs: Date.now() - this.startMs };
    this.emitState();
    this.emitAction(null);
  }

  private fail(error: unknown): void {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("RUNTIME_ERROR", String(error), { retryable: false });
    const playbackError: PlaybackError = {
      code: appError.code,
      message: appError.message,
      at: new Date().toISOString(),
    };
    this.state = {
      ...this.state,
      status: "error",
      errors: [...this.state.errors, playbackError],
    };
    this.emitState();
  }

  private roleOf(id: string | undefined): Role | undefined {
    if (id === undefined) return undefined;
    return this.lesson.roles.find((r) => r.id === id);
  }

  private setStatus(status: PlaybackStatus): void {
    this.state = { ...this.state, status };
    this.emitState();
  }

  private emitState(): void {
    for (const listener of this.stateListeners) listener(this.state);
  }

  private emitAction(action: Action | null): void {
    const role = action ? this.roleOf(action.roleId) : undefined;
    for (const listener of this.actionListeners) listener(action, role);
  }
}
