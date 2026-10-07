# DATA-MODEL

> 领域数据模型。权威定义在 `packages/types/src/`，本文件描述其语义与约束。
> 新增/修改类型：先改本文件，再改 `packages/types`，再更新 `PRODUCT-SOURCE-MAP.md`。

最近更新：2026-09-09

---

## 1. 设计原则

- 类型名 PascalCase，字段名 camelCase
- ID 统一 `string`（nanoid(12)）
- 时间统一 ISO 8601 字符串
- 枚举用 union string type，**不用 TS enum**
- 每个实体同时提供 **Zod schema**（运行时校验）与 **TS 类型**（编译期），类型由 schema 推导，避免两套定义漂移

---

## 2. 核心三层

```
Lesson ──< Scene ──< Action
  │           │
  ├──< Role   ├──< Slide ──< SlideElement
  │           └──< Whiteboard ──< Stroke
  └──< Material
```

---

## 3. 实体

### 3.1 Lesson

```ts
interface Lesson {
  id: string;
  title: string;
  description: string;
  topic: string;                 // 用户原始输入
  language: "zh-CN" | "en-US";
  createdAt: string;             // ISO 8601
  updatedAt: string;
  status: LessonStatus;
  roles: Role[];                 // 1 位老师 + N 位学生
  scenes: Scene[];
  sourceMaterials?: Material[];
  meta: LessonMeta;              // difficulty / estimatedDurationMin / model 配置快照
}

type LessonStatus =
  | "draft"               // 仅有 topic
  | "outlining"           // 大纲生成中
  | "scenes_generating"   // 生成各 Scene 内容
  | "actions_generating"  // 编排 Action 列表
  | "ready"               // 可进入课堂
  | "failed";
```

**渐进式 ready 语义**：`status === "ready"` 只要求第 1 个 Scene 就绪，不要求所有 Scene 完成。

### 3.2 Role

```ts
interface Role {
  id: string;
  name: string;
  kind: "teacher" | "student";
  avatarUrl: string;          // emoji 或图片 URL；同一 Lesson 内需可辨识
  personality: string;        // 一句话人设
  bio: string;                // 详细介绍
  voice: VoiceConfig;
  promptPersona: string;      // 注入 system prompt 的角色设定
  color: string;              // 品牌色
}
```

`promptPersona` 决定该角色在 LLM 调用中的说话风格与行为模式。

### 3.3 Scene

```ts
interface Scene {
  id: string;
  index: number;              // 在 Lesson 中的顺序，必须 === 数组下标
  title: string;
  summary: string;
  learningGoals: string[];
  slide?: Slide;
  whiteboard?: Whiteboard;
  actions: Action[];
  status: "pending" | "generating" | "ready" | "failed";
  durationMs?: number;
}
```

### 3.4 Slide / SlideElement

```ts
interface Slide {
  id: string;
  layout: "title" | "content" | "two-column" | "image" | "quote" | "custom";
  title?: string;
  elements: SlideElement[];
  notes?: string;             // 讲稿（导出 PPTX 时进备注区）
  background?: string;
}

type SlideElement =
  | { kind: "text";  id: string; text: string; style?: TextStyle; region: Rect }
  | { kind: "image"; id: string; src: string; alt?: string; region: Rect }
  | { kind: "list";  id: string; items: string[]; ordered: boolean; region: Rect }
  | { kind: "code";  id: string; language: string; source: string; region: Rect }
  | { kind: "shape"; id: string; shape: "rect" | "circle" | "arrow"; region: Rect };

interface Rect { x: number; y: number; w: number; h: number; }  // 0~1 归一化
```

### 3.5 Whiteboard

```ts
interface Whiteboard {
  id: string;
  strokes: Stroke[];
  background?: string;
}

interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;   // 0~1 归一化
}
```

### 3.6 Action 系统（核心）

```ts
interface ActionBase {
  id: string;
  type: ActionType;
  roleId?: string;          // 哪个角色发起
  startAtMs?: number;       // 相对 Scene 起点的时间
  blocking: boolean;        // 是否阻塞后续 action
  meta?: Record<string, unknown>;
}
```

| 类型 | 用途 | 阶段 | payload |
|---|---|---|---|
| `SPEECH` | 角色讲话（TTS + 字幕） | Phase 1 | `text`, `emotion?`, `showSubtitle` |
| `SLIDE` | 切换/展示幻灯片 | Phase 1 | `op: show\|next\|prev\|goto`, `slideId?` |
| `FOCUS` | 聚焦 Slide 内某元素 | Phase 2 | `elementId`, `style: spotlight\|zoom`, `durationMs` |
| `WRITE` | 白板绘制 | Phase 2 | `strokes`, `speedMs` |
| `INTERACT` | 提问/测验/投票 | Phase 2 | `kind: quiz\|open_question\|poll\|code`, `prompt`, `choices?`, `acceptUserInput`, `timeoutMs?`, `onAnswer?` |
| `DISCUSS` | 多 Agent 讨论 | Phase 2 | `topic`, `participantRoleIds`, `minRounds`, `maxRounds`, `moderationPrompt?` |
| `WAIT` | 纯等待 | Phase 2 | `durationMs` |

**禁止**把 Action 建模成 `{ type: string, payload: any }`。每种 Action 是有判别联合（discriminated union），`switch` 穷尽检查。

### 3.7 TraceRecord

```ts
interface TraceRecord {
  id: string;
  lessonId?: string;
  sceneId?: string;
  agent: string;            // "outline_agent" | "scene_agent" | "action_agent" | ...
  node: string;             // 流水线节点名：retrieve/plan/draft/validate/critique/finalize
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd?: number;
  status: "ok" | "error";
  startedAt: string;
  finishedAt: string;
  error?: { code: string; message: string; stack?: string };
}
```

> **安全红线**：TraceRecord **不保存** prompt/response 全量原文（除非显式开启 debug 且用户知情）、**绝不保存** API Key / Authorization header。

### 3.8 PlaybackState

```ts
interface PlaybackState {
  status: "idle" | "loading" | "ready" | "playing" | "paused"
        | "waiting_for_user" | "error" | "finished";
  currentSceneIndex: number;
  currentActionIndex: number;
  elapsedMs: number;
  playbackRate: number;     // 0.5 / 1 / 1.5 / 2
  errors: PlaybackError[];
}
```

---

## 4. 运行时不变量（强制校验）

以下规则由 `packages/types/src/validation.ts` 强制，**违反即 reject**：

| # | 不变量 |
|---|---|
| INV-1 | `Lesson.scenes[i].index === i` |
| INV-2 | `SPEECH` / `DISCUSS` action 必须带 `roleId`，且该 `roleId` 在 `Lesson.roles` 中存在 |
| INV-3 | `FOCUS.elementId` 必须指向**同 Scene** 的 `slide.elements[].id` |
| INV-4 | `INTERACT.choices` 只在 `kind === "quiz" \| "poll"` 时存在 |
| INV-5 | 同一 Lesson 内所有 `Role.id` 唯一 |
| INV-6 | `SLIDE` action 的 `slideId`（若提供）必须在当前 Lesson 的 Scene slide 中存在 |
| INV-7 | `Scene.actions` 中 Action `id` 唯一 |

**处理策略**：
- 非法数据 → 返回结构化 `ValidationError`（含路径与原因）
- **禁止**：自动猜测、自动修复、静默忽略、best-effort 播放
- 播放引擎遇到校验失败 → 进入 `error` 状态并在 UI 标红，提供「查看错误 / 重新生成」
