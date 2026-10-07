# AGENT-ARCHITECTURE

> Agent 架构与生成流水线。

最近更新：2026-09-09

---

## 1. Agent 清单

| Agent | 输入 | 输出 | 阶段 | 状态 |
|---|---|---|---|---|
| `outline_agent` | `topic`, `roles`, `materials?`, `language` | `OutlineOutput`（title / description / scenes[] / estimatedDurationMin / difficulty） | Phase 1B | NOT_STARTED |
| `scene_agent` | `lesson`, `sceneIndex`, `roles` | `{ slide, script }` | Phase 1B | NOT_STARTED |
| `action_agent` | `scene`, `roles` | `Action[]` | Phase 1B | NOT_STARTED |

未来（Phase 2+）：`teacher_agent` / `student_agent` / `interaction_agent` / `grade_agent`。**Phase 0 不无意义扩张。**

---

## 2. 流水线（Pipeline）

每个 Agent 遵循统一节点链：

```
Input
  ↓
Retrieve / Context     —— 组装上下文（role persona、已有场景、素材）
  ↓
Plan                   —— 分析任务、确定范围与结构
  ↓
Draft                  —— 调用 LLM 产出草稿（结构化输出走 generateObject）
  ↓
Validate               —— Zod schema 校验 + 领域不变量校验；失败则进入 Retry/Repair
  ↓
Critique               —— 自检（覆盖度、角色一致性、节奏）
  ↓
Finalize               —— 归一化、补齐 id/时间戳，产出最终对象
```

> 这是**真实执行**的流水线，不是「prompt → LLM → JSON」。
> 若某阶段因成本/模型能力采用简化流程，必须在代码注释与本文件标注 `SIMPLIFIED IMPLEMENTATION`，**不得声称已完整实现**。

### 简化声明（Phase 1B 初版）

- `Critique` 阶段在 MVP 采用**基于规则的轻量自检**（字段完整度、长度、角色引用合法性），而非第二次 LLM 调用。
  标记为 `SIMPLIFIED IMPLEMENTATION`，理由：MVP 延迟预算（Scene P50 < 20s）不允许双倍 LLM 往返。后续可通过配置开关切换为 LLM critique。

---

## 3. 编排（Orchestrator）

```
用户输入 "人工智能是什么？"
    │
    ▼
outline_agent  →  Lesson 骨架（N 个 Scene 标题+摘要）
    │
    ├─（并行）→ scene_agent#1 → action_agent#1 ─┐
    ├─（并行）→ scene_agent#2 → action_agent#2 ─┤
    └─（并行）→ scene_agent#N → action_agent#N ─┘
    │
    ├─ 第 1 个 Scene 就绪 → 立即 push /classroom/:id
    └─ 剩余 Scene 后台继续，SSE 推流注入 lessonStore
```

**渐进式进入课堂是产品核心体验**，禁止「全量生成完再进课堂」。

---

## 4. 依赖方向

```
packages/agents
    ↓ 只依赖
packages/llm  +  packages/prompts  +  packages/types
    ↓
Vercel AI SDK
```

`packages/agents` **禁止** import `@ai-sdk/*` 或任何 Provider SDK。

---

## 5. Prompt 管理

所有 prompt 集中在 `packages/prompts/src/`，带 `version` 字段，**禁止内联在业务代码**。

```ts
export const OUTLINE_PROMPT = {
  version: "1.0.0",
  template: `...`,
};
```

Prompt 变更需递增 version 并在 `CHANGELOG.md` 记录。

---

## 6. 失败处理

| 失败点 | 行为 |
|---|---|
| `outline_agent` 失败 | Lesson 置 `failed`，保留 topic，可整体重试（不丢输入） |
| 某个 `scene_agent` 失败 | 仅该 Scene 置 `failed`，其余继续；UI 提供「重新生成」 |
| 某个 `action_agent` 失败 | 仅该 Scene 的 actions 置 `failed`，可单独重试 |
| 校验失败 | 记录 `ValidationError` + traceId，重跑 Draft（最多 2 次），仍失败则 Scene `failed` |
| LLM 超时 / 网络错误 | 指数退避重试 2 次；错误分类返回，UI 可切换模型重试 |
