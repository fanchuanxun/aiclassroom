# RUNTIME — 课堂播放引擎

> Classroom 不是普通页面，它是一个 Runtime。

最近更新：2026-09-09

---

## 1. 组成

```
Classroom Runtime
├── PlaybackEngine        # 状态机 + tick 循环
├── ExecutorRegistry      # action.type → executor 映射
├── ExecutorContext       # 副作用出口（UI / TTS / Store）
└── PlaybackStore         # Zustand：可观测状态
```

**禁止**把所有逻辑写进 `Classroom.tsx`，也**禁止**用 `if / else if` 链无限膨胀。新增能力 = 新增 executor + 注册。

---

## 2. 播放状态机

```
idle ──(load lesson)──────────→ loading
loading ──(success)───────────→ ready
ready ──(play)────────────────→ playing
playing ──(pause)─────────────→ paused
paused ──(resume)─────────────→ playing
playing ──(INTERACT action)───→ waiting_for_user
waiting_for_user ──(answer)───→ playing
playing ──(all done)──────────→ finished
any ──(error)─────────────────→ error
```

状态定义在 `packages/types/src/playback.ts`。转换必须由显式 reducer 完成，禁止在组件里直接赋值。

---

## 3. Executor 注册表

```ts
type ActionExecutor = (
  action: Action,
  ctx: ExecutorContext,
  signal: AbortSignal
) => Promise<void>;

const executors: Record<ActionType, ActionExecutor> = {
  SPEECH:   speechExecutor,
  SLIDE:    slideExecutor,
  FOCUS:    focusExecutor,     // Phase 2
  WRITE:    writeExecutor,     // Phase 2
  INTERACT: interactExecutor,  // Phase 2
  DISCUSS:  discussExecutor,   // Phase 2
  WAIT:     waitExecutor,      // Phase 2
};
```

Phase 1 真实实现 `SPEECH` / `SLIDE`；其余在架构上留位，未实现前调用必须抛出明确的「NOT IMPLEMENTED」错误，**不得静默跳过**。

### 扩展方式（新增 Action 类型 3 步）

1. `packages/types` 加类型定义 + Zod schema
2. `executors/` 加一个 executor 实现
3. 注册表中注册

---

## 4. Tick 循环

```ts
async tick() {
  const scene = this.lesson.scenes[currentSceneIndex];

  if (scene.status === "pending" || scene.status === "generating") {
    this.showPlaceholder("生成中...");   // 等待后台 SSE 推送
    return;
  }
  if (scene.status === "failed") {
    this.showRetryButton();
    return;
  }

  const action = scene.actions[currentActionIndex];
  if (!action) { this.advanceScene(); return; }

  const executor = executors[action.type];
  await executor(action, this.context, this.signal);

  this.store.advanceAction();
}
```

取消机制（EI-03）：整个播放过程持有 `AbortController`，`pause` / 卸载 / 跳场景时 `abort()`，executor 必须响应 `signal`。

---

## 5. Executor 语义

### SPEECH

1. 设置当前说话者 → 显示气泡 + 字幕
2. 通过 **TTS Adapter** 朗读（MVP：Web Speech API）
3. 等待朗读结束或用户跳过

> TTS **不得写死在 Classroom UI**，统一走 `packages/tts` 抽象，便于后续替换为云端 TTS / 多角色语音。

### SLIDE

`op: show | next | prev | goto` → 切换当前 Slide。

### FOCUS（Phase 2）

`elementId` 必须属于**当前 Scene 的 Slide**（INV-3），否则 reject。效果：`spotlight` / `zoom`。

### INTERACT（Phase 2）

显示互动 UI；`acceptUserInput` 为真时进入 `waiting_for_user`；可调用 `grade_agent` 评分。

### DISCUSS（Phase 2）

按 `participantRoleIds` 轮转，`minRounds`~`maxRounds` 轮，每轮调用 LLM 生成发言并经 SPEECH 播放。

### WRITE / WAIT（Phase 2）

SVG 逐笔动画 / 纯等待。

---

## 6. 降级

- TTS 失败 → 字幕 only，播放继续
- Scene 未就绪（后台还在生成）→ 显示占位，不阻塞当前播放
- Scene 失败 → 显示「重新生成」
- 数据校验失败 → 进入 `error`，标红，禁止 best-effort 播放
