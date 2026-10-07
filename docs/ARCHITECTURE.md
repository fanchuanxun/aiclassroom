# ARCHITECTURE

> 系统架构。代码是本文件的投影。

最近更新：2026-09-09

---

## 1. 分层总览

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser (Client)                        │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐  │
│  │ Next.js UI   │  │ Zustand+Immer │  │ Playback Engine    │  │
│  │ (App Router) │──│ Dexie (IDB)   │──│ (state machine +   │  │
│  │ + packages/ui│  │ stores        │  │  executor registry)│  │
│  └──────┬───────┘  └───────────────┘  └──────────┬───────────┘  │
│         │                                         │              │
│         │                              ┌──────────▼───────────┐  │
│         │                              │ TTS Adapter (Web     │  │
│         │                              │ Speech API → 云端)   │  │
│         │                              └──────────────────────┘  │
└─────────┼────────────────────────────────────────────────────────┘
          │ fetch (SSE / JSON)
          ▼
┌───────────────────────────────────────────────────────────────┐
│                  Next.js Route Handlers (Server)               │
│  /api/generate/outline   /api/generate/scene                   │
│  /api/generate/action    /api/hello                            │
└─────────┬─────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────┐
│                      packages/agents                           │
│  outline_agent    scene_agent    action_agent                  │
│  （显式节点流水线：retrieve→plan→draft→validate→critique→finalize）│
└─────────┬─────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────┐
│                       packages/llm                             │
│  generate() / stream() / structuredOutput()                    │
│  + errors + retry/timeout + trace                              │
└─────────┬─────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────┐
│              Vercel AI SDK + Provider Adapters                 │
│  openai / anthropic / google / deepseek / openai-compatible     │
└───────────────────────────────────────────────────────────────┘
```

**核心约束**：箭头只能向下依赖，不得反向。`packages/agents` 不允许 import 任何 Provider SDK；`packages/llm` 是唯一调用 LLM 的入口。

---

## 2. 仓库结构

```
AIClassRoom/
├── docs/                      # SSOT
├── apps/
│   └── web/                   # Next.js 16 主应用
│       └── src/
│           ├── app/           # App Router（页面 + Route Handlers）
│           ├── features/      # 业务域：home / generate / classroom / settings
│           ├── stores/        # Zustand stores
│           ├── lib/           # db (Dexie) / utils
│           └── hooks/
└── packages/
    ├── types/                 # 领域类型 + Zod schema + 不变量校验
    ├── ui/                    # shadcn 风格组件库
    ├── prompts/               # 版本化 LLM prompt
    ├── agents/                # Agent 流水线
    ├── llm/                   # LLM 唯一入口
    ├── tts/                   # TTS/ASR 抽象
    └── config/                # tsconfig / eslint 共享配置
```

---

## 3. 生成阶段数据流

```
UI submit
  → POST /api/generate/outline (SSE)
      ↳ outline_agent 流式输出 → 前端实时拼 Lesson.scenes[] 骨架
  → 用户点「继续」
  → 并行 POST /api/generate/scene?i=0..N (SSE)
      ↳ scene_agent 逐个生成，status: pending → ready
  → 并行 POST /api/generate/action?i=0..N (SSE)
      ↳ action_agent 生成 Action[]
  → 触发条件：outline 完成 + scenes[0].status === "ready"
      ↳ 立即跳转 /classroom/:id
      ↳ 剩余 Scene 后台继续 SSE 推流到 lessonStore
```

## 4. 播放阶段数据流

```
Zustand playbackStore {
  lesson, currentSceneIndex, currentActionIndex, status, ...
}

engine.tick():
  取当前 action → 查 executor registry → 执行（可能异步 TTS）
  → 完成 → currentActionIndex++ → 下一 tick
  → action 耗尽 → advanceScene()

用户事件: pause / next / prev / seek / answer → 触发 reducer
```

## 5. 错误处理与降级

| 场景 | 处理 |
|---|---|
| LLM 调用失败 | 自动重试 2 次（指数退避）→ 仍失败返回结构化错误 + traceId + 可切换模型重试 |
| TTS 失败 | 降级到字幕 only 模式，不阻塞播放 |
| Scene 生成失败 | 不阻塞其他 Scene，该 Scene 显示「重新生成」 |
| 网络断开 | 已生成内容保留，未生成提示稍后重试 |

错误码体系见 `packages/llm/src/errors.ts`，分类：`LLM_ERROR` / `NETWORK_ERROR` / `VALIDATION_ERROR` / `GENERATION_ERROR` / `RUNTIME_ERROR` / `PERSISTENCE_ERROR` / `PROVIDER_ERROR` / `TIMEOUT`。

## 6. 安全边界

- **Server Key**：来自环境变量（`OPENAI_API_KEY` 等），永不进入浏览器
- **Browser Key**：用户在设置里填写，存 Dexie，每个请求随 body 传给服务端使用，服务端不落盘、不写日志
- **禁止**：硬编码 Key、Git 提交 Key、`console.log` Key、Trace 记录 Key 或 Authorization header
- 仓库提供 `.env.example`，`.env*.local` 进 `.gitignore`

## 7. 性能预算

| 指标 | 预算 |
|---|---|
| 首页 TTI | < 2s |
| 首页 JS 初始加载 | < 150 KB gzip |
| 课堂页 JS 初始加载 | < 300 KB gzip |
| 切换 Scene 响应 | < 300 ms |
| 生成大纲 P50 | < 15 s |
| 生成一个 Scene 的 actions P50 | < 20 s |

> 当前全部 **UNVERIFIED**（依赖真实模型调用与浏览器实测，见 `PRODUCT-SOURCE-MAP.md` BL-01 / BL-02）。
