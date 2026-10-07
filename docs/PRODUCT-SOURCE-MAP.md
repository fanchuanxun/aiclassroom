# PRODUCT-SOURCE-MAP

> 唯一真相映射表：把《教学讲义-从零搭建 AI 智能体互动课堂》的要求，映射到本项目的产品能力、技术模块、文件位置、实现状态与测试状态。
>
> 本文件是 SSOT 的索引。代码是本文档的投影：文档写了 IMPLEMENTED 但代码没有，属于事故。

- 来源资料：`教学讲义-从零搭建AI智能体互动课堂(1).pdf`（47 页，12 章 + 附录）
- 最近更新：2026-09-09
- 维护规则：任何功能状态变化，必须先改本文件，再改代码（若不一致，先改规范）

---

## 1. 来源分级（必须标注）

| 标记 | 含义 | 约束 |
|---|---|---|
| `SOURCE REQUIREMENT` | 讲义原文明确要求 | 必须实现，不得省略 |
| `PROJECT DECISION` | 讲义未定义，本项目主动决策 | 必须记录理由，可推翻 |
| `ENGINEERING INFERENCE` | 从讲义架构推导出的实现细节 | 可随架构演进而调整 |
| `FUTURE FEATURE` | 讲义提到但明确属于后续 Phase | 当前不得提前实现 |

> **禁止**：把 `PROJECT DECISION` / `ENGINEERING INFERENCE` 说成"讲义要求"。

## 2. 状态定义

实现状态：`NOT_STARTED` / `IN_PROGRESS` / `PARTIAL` / `IMPLEMENTED` / `NOT_IMPLEMENTED` / `BLOCKED`
测试状态：`NO_TESTS` / `IN_PROGRESS` / `TESTED` / `FAILED`

---

## 3. 主映射表

### 第一章：产品定位与需求分析

| ID | 讲义要求 | 分级 | 产品能力 | 技术模块 | 文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|---|---|
| SR-1.1 | 输入主题 → 60 秒内生成完整互动课程 | SOURCE | Topic → Lesson 生成链路 | generate pipeline | `apps/web/src/features/generate/` | NOT_STARTED | NO_TESTS |
| SR-1.2 | AI 老师讲课 + AI 同学提问 + 板书 + 测验 | SOURCE | Classroom 多角色播放 | classroom runtime | `apps/web/src/features/classroom/` | NOT_STARTED | NO_TESTS |
| SR-1.3 | 核心用户流程：首页→加载角色→确认角色→大纲→场景→动作→进入课堂 | SOURCE | 生成编排 Orchestrator | generate orchestrator | `apps/web/src/features/generate/orchestrator.ts` | NOT_STARTED | NO_TESTS |
| SR-1.4 | 渐进式进入课堂：大纲 + 第 1 个 Scene 就绪即跳转 | SOURCE | Scene 0 ready → router push | orchestrator + playback | 同上 | NOT_STARTED | NO_TESTS |
| SR-1.5 | 页面清单 6 个页面 | SOURCE | 路由与页面 | App Router | `apps/web/src/app/` | NOT_STARTED | NO_TESTS |
| SR-1.6 | 首页 TTI < 2s；切场景 < 300ms | SOURCE | 性能预算 | — | — | NOT_STARTED | NO_TESTS |
| SR-1.7 | 生成失败必须能回到上一步而不丢输入 | SOURCE | 生成失败恢复 | generate store + error boundary | `apps/web/src/stores/` | NOT_STARTED | NO_TESTS |
| SR-1.8 | API Key 用 Dexie (IndexedDB) 存储 | SOURCE | 密钥本地存储 | Dexie | `apps/web/src/lib/db.ts` | NOT_STARTED | NO_TESTS |
| SR-1.9 | 每次 LLM 调用有 trace（model/tokens/latency/cost） | SOURCE | Trace 采集 | packages/llm + packages/types | `packages/llm/src/trace.ts`, `packages/types/src/trace.ts` | NOT_STARTED | NO_TESTS |
| SR-1.10 | 核心逻辑（播放引擎、数据转换）必须有单测 | SOURCE | 单元/集成测试 | Vitest | `**/*.test.ts` | NOT_STARTED | NO_TESTS |

### 第二章：技术栈选型与决策

| ID | 讲义要求 | 分级 | 技术模块 | 文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|---|
| SR-2.1 | Next.js 16 App Router | SOURCE | Web 应用 | `apps/web/` | NOT_STARTED | NO_TESTS |
| SR-2.2 | React 19 | SOURCE | UI 运行时 | `apps/web/` | NOT_STARTED | NO_TESTS |
| SR-2.3 | TypeScript 5 strict，禁止 any | SOURCE | 类型基线 | `packages/config/tsconfig.base.json` | NOT_STARTED | NO_TESTS |
| SR-2.4 | Tailwind CSS 4 + @theme 设计 token | SOURCE | 样式基线 | `apps/web/src/app/globals.css` | NOT_STARTED | NO_TESTS |
| SR-2.5 | Radix UI Primitives | SOURCE | 无障碍基础组件 | `packages/ui/src/components/` | NOT_STARTED | NO_TESTS |
| SR-2.6 | shadcn/ui 复制粘贴模式 | SOURCE | 项目级组件库 | `packages/ui/src/components/` | NOT_STARTED | NO_TESTS |
| SR-2.7 | lucide-react 图标 | SOURCE | 图标 | `packages/ui` | NOT_STARTED | NO_TESTS |
| SR-2.8 | framer-motion 场景切换/聚光灯 | SOURCE | 动效 | `apps/web/src/features/classroom/` | NOT_STARTED | NO_TESTS |
| SR-2.9 | Tiptap 富文本（笔记/讲稿/Slide） | SOURCE | 编辑器 | `packages/ui/src/editor/` | NOT_STARTED | NO_TESTS |
| SR-2.10 | ECharts 图表 | SOURCE | 可视化 | `packages/ui/src/charts/` | NOT_STARTED | NO_TESTS |
| SR-2.11 | @xyflow/react 大纲流程图 / trace DAG | SOURCE | 流程可视化 | `apps/web/src/features/` | NOT_STARTED | NO_TESTS |
| SR-2.12 | 原生 SVG 白板笔画动画 | SOURCE | 白板 | `apps/web/src/features/classroom/` | NOT_STARTED | NO_TESTS |
| SR-2.13 | Zustand 5 + Immer 状态管理 | SOURCE | 客户端状态 | `apps/web/src/stores/` | NOT_STARTED | NO_TESTS |
| SR-2.14 | Dexie 持久化（草稿/API Key/TTS 缓存） | SOURCE | 本地持久化 | `apps/web/src/lib/db.ts` | NOT_STARTED | NO_TESTS |
| SR-2.15 | react-hook-form + zod 表单 | SOURCE | 表单 | `apps/web/src/features/` | NOT_STARTED | NO_TESTS |
| SR-2.16 | next-intl 国际化 zh-CN / en-US | SOURCE | i18n | `apps/web/src/i18n/` | NOT_STARTED | NO_TESTS |
| SR-2.17 | Vercel AI SDK 为统一接入层，不自写 Provider | SOURCE | LLM 接入 | `packages/llm/` | NOT_STARTED | NO_TESTS |
| SR-2.18 | LangChain Core 基础原语 | SOURCE | Agent 原语 | **见 D-01** | NOT_IMPLEMENTED | NO_TESTS |
| SR-2.19 | LangGraph 多 Agent 编排 | SOURCE | Agent 编排 | **见 D-01** | NOT_IMPLEMENTED | NO_TESTS |
| SR-2.20 | 11 家 Provider 支持 | SOURCE | Provider 适配 | `packages/llm/src/providers/` | NOT_STARTED | NO_TESTS |
| SR-2.21 | 禁止引入技术清单（CSS-in-JS/Redux/Slate/Chart.js/Lodash/Moment 等） | SOURCE | 依赖治理 | `docs/TECH-STACK.md` | IMPLEMENTED（文档约束已落） | NO_TESTS |
| SR-2.A | pnpm monorepo + packages/* 分包 | SOURCE | 工程结构 | `pnpm-workspace.yaml` | NOT_STARTED | NO_TESTS |

> **D-01（DECISION REQUIRED）**：讲义要求 LangGraph + LangChain Core 做 Agent 编排（SR-2.18 / SR-2.19）。
> 本项目 Phase 0/1 采用 `packages/agents` 自研**显式节点流水线 runner**（retrieve→plan→draft→validate→critique→finalize），分级 `PROJECT DECISION`，理由见 [DECISION-01](#decision-01)。节点与 LangGraph node 语义 1:1 对应，后续可平移。
> 状态：**PARTIAL（架构已留位，LangGraph 未引入）**。

### 第三章：系统架构设计

| ID | 讲义要求 | 分级 | 技术模块 | 文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|---|
| SR-3.1 | 三层模型 Lesson → Scene → Action | SOURCE | 领域模型 | `packages/types/src/` | NOT_STARTED | NO_TESTS |
| SR-3.2 | Monorepo 目录结构（apps/web + 7 个 packages） | SOURCE | 工程结构 | 仓库根 | NOT_STARTED | NO_TESTS |
| SR-3.3 | 播放引擎状态机 idle→loading→ready→playing⇄paused→waiting_for_user/error/finished | SOURCE | Playback | `apps/web/src/features/classroom/playback/` | NOT_STARTED | NO_TESTS |
| SR-3.4 | 生成流水线三步串行、步内并行 | SOURCE | Orchestrator | `apps/web/src/features/generate/` | NOT_STARTED | NO_TESTS |
| SR-3.5 | 错误处理与降级（LLM 重试 2 次指数退避 / TTS 降级字幕 / Scene 失败不阻塞 / 断网保留） | SOURCE | 错误体系 | `packages/llm/src/errors.ts` + runtime | NOT_STARTED | NO_TESTS |
| SR-3.6 | 性能预算（首页 JS<150KB / 课堂<300KB / 生成大纲 P50<15s / Scene actions P50<20s） | SOURCE | 性能 | — | NOT_STARTED | NO_TESTS |

### 第四章：领域数据模型

| ID | 讲义要求 | 分级 | 文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|
| SR-4.1 | Lesson（含 LessonStatus 6 态） | SOURCE | `packages/types/src/lesson.ts` | NOT_STARTED | NO_TESTS |
| SR-4.2 | Role（teacher/student、voice、promptPersona、color） | SOURCE | `packages/types/src/role.ts` | NOT_STARTED | NO_TESTS |
| SR-4.3 | Scene（index/title/summary/learningGoals/slide/whiteboard/actions/status） | SOURCE | `packages/types/src/scene.ts` | NOT_STARTED | NO_TESTS |
| SR-4.4 | Slide + SlideElement（text/image/list/code/shape）+ Rect 归一化 | SOURCE | `packages/types/src/slide.ts` | NOT_STARTED | NO_TESTS |
| SR-4.5 | Whiteboard + Stroke | SOURCE | `packages/types/src/whiteboard.ts` | NOT_STARTED | NO_TESTS |
| SR-4.6 | Action 系统 7 种（SPEECH/SLIDE/FOCUS/WRITE/INTERACT/DISCUSS/WAIT） | SOURCE | `packages/types/src/action.ts` | NOT_STARTED | NO_TESTS |
| SR-4.7 | TraceRecord | SOURCE | `packages/types/src/trace.ts` | NOT_STARTED | NO_TESTS |
| SR-4.8 | PlaybackState | SOURCE | `packages/types/src/playback.ts` | NOT_STARTED | NO_TESTS |
| SR-4.9 | 运行时不变量强制校验（5 条） | SOURCE | `packages/types/src/validation.ts` | NOT_STARTED | NO_TESTS |
| SR-4.10 | 违反不变量必须拒绝播放并标红，禁止尽力而为跳过 | SOURCE | 同上 + runtime | NOT_STARTED | NO_TESTS |

### 第五章：Phase 0 工程化基础

| ID | 讲义要求 | 分级 | 文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|
| SR-5.1 | pnpm workspace 初始化 | SOURCE | `pnpm-workspace.yaml` | NOT_STARTED | NO_TESTS |
| SR-5.2 | `.npmrc`（shamefully-hoist / strict-peer-dependencies=false） | SOURCE | `.npmrc` | NOT_STARTED | NO_TESTS |
| SR-5.3 | tsconfig.base（strict + noUncheckedIndexedAccess） | SOURCE | `packages/config/` | NOT_STARTED | NO_TESTS |
| SR-5.4 | ESLint 9+ flat config + Prettier（no-explicit-any / consistent-type-imports / no-console） | SOURCE | `packages/config/` | NOT_STARTED | NO_TESTS |
| SR-5.5 | Vitest 基线，每个 package 至少一个冒烟测试 | SOURCE | `vitest.config.ts` + `**/*.test.ts` | NOT_STARTED | NO_TESTS |
| SR-5.6 | packages/types 全量落地 | SOURCE | `packages/types/src/` | NOT_STARTED | NO_TESTS |
| SR-5.7 | packages/ui 6 个基础组件 | SOURCE | `packages/ui/src/components/` | NOT_STARTED | NO_TESTS |
| SR-5.8 | packages/llm 薄封装（resolveModel / generateStructured） | SOURCE | `packages/llm/src/` | NOT_STARTED | NO_TESTS |
| SR-5.9 | Next.js 应用骨架 + ThemeProvider layout | SOURCE | `apps/web/src/app/layout.tsx` | NOT_STARTED | NO_TESTS |
| SR-5.10 | Dexie 表：drafts / lessons / apiKeys / traces | SOURCE | `apps/web/src/lib/db.ts` | NOT_STARTED | NO_TESTS |
| SR-5.11 | Zustand settings-store 骨架 | SOURCE | `apps/web/src/stores/` | NOT_STARTED | NO_TESTS |
| SR-5.12 | Hello LLM 端到端烟囱（/hello 页面真实流式） | SOURCE | `apps/web/src/app/hello/` + `api/hello/` | NOT_STARTED | NO_TESTS |

### 第六至十一章（Phase 1A / 1B / 1C / 2 / 3 / 4）

| ID | 讲义要求 | 分级 | 计划文件位置 | 实现 | 测试 |
|---|---|---|---|---|---|
| SR-6.1 | 首页聊天式输入框 + 设置入口 | SOURCE | `apps/web/src/features/home/` | NOT_STARTED | NO_TESTS |
| SR-6.2 | 设置弹窗三栏布局（8 类别 / 11 Provider / 配置面板） | SOURCE | `apps/web/src/features/settings/` | NOT_STARTED | NO_TESTS |
| SR-6.3 | Provider 数据定义（ProviderDef / ModelDef） | SOURCE | `apps/web/src/features/settings/providers.ts` | NOT_STARTED | NO_TESTS |
| SR-6.4 | 固定角色库 5 个默认角色（1 老师 + 4 学生） | SOURCE | `packages/types/src/roles.ts` 或 `apps/web/src/lib/roles.ts` | NOT_STARTED | NO_TESTS |
| SR-6.5 | 角色选择器 Popover，至少保留一位老师 | SOURCE | `apps/web/src/features/home/` | NOT_STARTED | NO_TESTS |
| SR-6.6 | 语音配置（Web Speech API，声音选择 + 语速） | SOURCE | `packages/tts/` | NOT_STARTED | NO_TESTS |
| SR-7.1 | outline_agent（plan→draft→finalize） | SOURCE | `packages/agents/src/outline/` | NOT_STARTED | NO_TESTS |
| SR-7.2 | scene_agent（每 Scene 独立并行，产出 slide + script） | SOURCE | `packages/agents/src/scene/` | NOT_STARTED | NO_TESTS |
| SR-7.3 | action_agent（编排 Action[]） | SOURCE | `packages/agents/src/action/` | NOT_STARTED | NO_TESTS |
| SR-7.4 | SSE 三个生成端点 | SOURCE | `apps/web/src/app/api/generate/{outline,scene,action}/route.ts` | NOT_STARTED | NO_TESTS |
| SR-7.5 | Orchestrator：第 1 个 Scene 完成即跳转，其余 Promise.allSettled | SOURCE | `apps/web/src/features/generate/orchestrator.ts` | NOT_STARTED | NO_TESTS |
| SR-7.6 | Prompt 集中在 packages/prompts，带版本号 | SOURCE | `packages/prompts/src/` | NOT_STARTED | NO_TESTS |
| SR-8.1 | 课堂三栏布局（Scene 列表 / Slide + 字幕 / 笔记与对话） | SOURCE | `apps/web/src/features/classroom/` | NOT_STARTED | NO_TESTS |
| SR-8.2 | 播放状态机与转换规则 | SOURCE | `apps/web/src/features/classroom/playback/` | NOT_STARTED | NO_TESTS |
| SR-8.3 | Action Executor 注册表（7 个 executor） | SOURCE | `.../playback/executors/` | NOT_STARTED | NO_TESTS |
| SR-8.4 | Tick 循环（Scene 状态检查 + executor 执行 + advance） | SOURCE | `.../playback/engine.ts` | NOT_STARTED | NO_TESTS |
| SR-8.5 | speechExecutor（Web Speech API + 字幕） | SOURCE | `.../executors/speech.ts` | NOT_STARTED | NO_TESTS |
| SR-8.6 | slideExecutor（show/next/prev/goto） | SOURCE | `.../executors/slide.ts` | NOT_STARTED | NO_TESTS |
| SR-8.7 | SlideRenderer + SlideElement | SOURCE | `.../slide/slide-renderer.tsx` | NOT_STARTED | NO_TESTS |
| SR-8.8 | 播放控制条（prev/play/next/倍速） | SOURCE | `.../playback-controls.tsx` | NOT_STARTED | NO_TESTS |
| SR-9.1 | Phase 2 扩展 action 至 7 种 | SOURCE | `.../executors/` | NOT_STARTED（Phase 2） | NO_TESTS |
| SR-9.2 | 真 TTS / ASR（云端） | SOURCE | `packages/tts/` | NOT_STARTED（Phase 2） | NO_TESTS |
| SR-9.3 | 用户举手提问（ASR → 注入 → 老师回答） | SOURCE | `apps/web/src/features/classroom/` | NOT_STARTED（Phase 2） | NO_TESTS |
| SR-10.1 | 服务端持久化 Drizzle + SQLite/Postgres | SOURCE | `packages/db/` | NOT_STARTED（Phase 3） | NO_TESTS |
| SR-10.2 | 三层编辑器（Scene 流程 / Action 时间线 / Slide WYSIWYG） | SOURCE | `apps/web/src/features/editor/` | NOT_STARTED（Phase 3） | NO_TESTS |
| SR-10.3 | 局部重新生成 Scene/Action | SOURCE | `apps/web/src/features/editor/` | NOT_STARTED（Phase 3） | NO_TESTS |
| SR-10.4 | PPTX / HTML 离线导出 | SOURCE | `apps/web/src/features/export/` | NOT_STARTED（Phase 3） | NO_TESTS |
| SR-11.x | 企业级（next-auth / RBAC / KMS / OTel / Docker） | SOURCE | — | NOT_STARTED（Phase 4） | NO_TESTS |

### 附录：实战踩坑

| ID | 讲义要求 | 分级 | 落实位置 | 实现 |
|---|---|---|---|---|
| SR-A.1 | Tailwind 4 `@source` 指向 packages/ui | SOURCE | `apps/web/src/app/globals.css` | NOT_STARTED |
| SR-A.2 | Radix Dialog 用内联 style 居中（避免 Tailwind 4 transform 问题） | SOURCE | `packages/ui/src/components/dialog.tsx` | NOT_STARTED |
| SR-A.3 | 角色 emoji 唯一性 | SOURCE | 默认角色库 | NOT_STARTED |
| SR-A.4 | 按钮 shrink-0 + whitespace-nowrap | SOURCE | `packages/ui/src/components/button.tsx` | NOT_STARTED |

---

## 4. 本项目决策（PROJECT DECISION）

| ID | 决策 | 理由 | 影响 |
|---|---|---|---|
| PD-01 | 统一 LLM 抽象放在 `packages/llm`，Provider 适配复用 Vercel AI SDK（不自写 HTTP 客户端） | 同时满足讲义 SR-2.17 与"Agent 不直连 Provider SDK" | 低风险 |
| PD-02 | 11 家 Provider 通过 `openai` / `anthropic` / `google` / `deepseek` / `openai-compatible` 5 个适配器覆盖 | OpenAI-compatible 覆盖 GLM/千问/Kimi/MiniMax/硅基流动/豆包/Grok，避免 11 份依赖 | 低风险 |
| PD-03 | TypeScript 锁定 5.9.x 而非 7.x | TS 7 为原生移植版，与 Next 16 / ESLint 10 生态组合风险高；讲义明确要求 TS 5 strict | 中风险（需复核） |
| PD-04 | Agent 流水线用自研显式节点 runner（见 D-01） | 见 DECISION-01 | 中风险 |
| PD-05 | 错误分类独立成 `packages/llm/src/errors.ts` 的错误码体系 | 满足"用户不能只看到 Something went wrong" | 低风险 |
| PD-06 | Trace 只记录结构化元数据，禁止序列化完整 request header | 满足 API Key 安全红线 | 低风险 |
| PD-07 | Mock Provider 仅存在于 `packages/llm/src/testing/`，生产实现不得引用 | 满足"Mock 与 Production 隔离" | 低风险 |

---

## 5. 讲义未定义、由工程推导的内容（ENGINEERING INFERENCE）

| ID | 内容 | 说明 |
|---|---|---|
| EI-01 | SSE 事件协议（started/progress/partial/outline_ready/scene_ready/action_ready/error/done） | 讲义只说"SSE 流式"，事件名未定义 |
| EI-02 | Action `id` 必填 + nanoid(12) | 讲义 ActionBase 有 id，未定生成规则 |
| EI-03 | Playback engine 用 `requestAnimationFrame` 无关的 async tick + AbortSignal 取消 | 讲义未定义取消机制 |
| EI-04 | Dexie schema version 管理与迁移策略 | 讲义只给 version(1) |
| EI-05 | 服务端 API Key 优先读环境变量，其次读请求内用户自带 key（区分 Server Key / Browser Key） | 讲义未区分，属安全必需 |

---

## 6. 明确不在当前范围（FUTURE FEATURE）

- Phase 2：7 种 Action 全量、云端 TTS/ASR、举手提问
- Phase 3：Drizzle 服务端持久化、三层编辑器、PPTX/HTML 导出
- Phase 4：SSO/RBAC/KMS/OpenTelemetry/Docker 部署
- 社交、商城、直播、支付、复杂 CRM、企业权限 —— **除非用户明确要求，一律不实现**

---

## 7. BLOCKED 项

| ID | 阻塞内容 | 原因 | 解除条件 |
|---|---|---|---|
| BL-01 | 真实 LLM 端到端验证 | 当前环境无任何 Provider API Key | 用户提供任一 Provider Key（env 或浏览器本地配置） |
| BL-02 | 性能预算实测（TTI / P50 生成耗时） | 依赖真实模型调用与浏览器实测 | BL-01 解除后 |
| BL-03 | LangGraph 引入与否 | 架构权衡，需用户拍板 | 见 DECISION-01 |

---

## 8. DECISION REQUIRED

### DECISION-01

**议题**：Agent 编排是否引入 LangGraph + LangChain Core（讲义 SR-2.18 / SR-2.19）？

**方案 A（本项目当前采用）**：自研显式节点流水线 runner
- 成本：低；无额外重依赖；节点即纯函数，单测直接覆盖
- 复杂度：低
- 可维护性：高
- 风险：偏离讲义文字；未来若强依赖 checkpoint / 循环图需改造
- 兼容性：与 Vercel AI SDK 无冲突（这是关键——LangGraph 原生绑定 LangChain ChatModel，与 AI SDK 混用需适配层）

**方案 B**：引入 `@langchain/langgraph`
- 成本：高（额外依赖体积 + 与 AI SDK 的适配成本）
- 复杂度：高（状态图 + checkpoint + 与 AI SDK 双模型体系并存）
- 可维护性：中（团队需同时懂两套抽象）
- 风险：中高（LangGraph 的 LangChain ChatModel 假设与 Vercel AI SDK 的 LanguageModel 不是同一接口）

**建议**：采用方案 A，节点命名与语义对齐 LangGraph，保留平移能力。
**待用户确认**：是否接受偏离讲义文字。
