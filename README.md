# AIClassRoom · AI 多智能体互动课堂

> 输入一个教学主题 → 多智能体协作生成一堂「AI 老师 + 4 位 AI 同学」的沉浸式互动课程 → 在课堂页播放。

把「被动看文档 / 看视频」升级成「可交互的多智能体课堂」：Slide 讲解、字幕、语音播报、AI 同学随时提问，用户也能插话互动。

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-monorepo-f69220?logo=pnpm&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/tests-117%20passed-6da544?logo=vitest&logoColor=white">
</p>

---

## 它解决什么问题

| 痛点 | 本项目的解法 |
|---|---|
| 视频课程单向，学生无法互动 | 课堂页支持随时提问、AI 同学参与讨论 |
| 文档学习枯燥，缺乏引导和节奏感 | 自动生成大纲 → 场景 → 教学动作，形成讲课节奏 |
| 制作高质量互动课程成本极高 | 输入主题即可生成，全流程自动化 |

---

## 核心链路

```
[首页输入主题]
    │
    ├──(并行)── [加载角色] / [加载用户素材]
    ▼
[确认角色] ── 1 位老师 + 4 位学生
    ▼
[生成大纲] ── outline_agent        ┐
    ▼                              │ 三个 Agent
[生成场景内容] ── scene_agent（并行）│ 走同一条
    ▼                              │ 显式节点流水线
[生成教学动作] ── action_agent（并行）┘
    │
    ├──(首个 Scene 就绪即跳转)──► [进入课堂]
    │                                  │
    └──(剩余 Scene 后台推流)────────► [播放引擎]
```

**每个 Agent 都走统一的显式节点链，不是「prompt → LLM → JSON」：**

```
Input → Retrieve/Context → Plan → Draft → Validate → Critique → Finalize
                                    ↑                    │
                                    └──── Retry/Repair ───┘
```

`Validate` 阶段用 Zod schema + 领域不变量双重校验，不通过则进入重试/修复。

---

## 技术架构

```
┌──────────────────── Browser ────────────────────┐
│  Next.js App Router  │  Zustand + Immer  │ Playback Engine │
│                      │  Dexie (IndexedDB)│ (状态机 +       │
│                      │                   │  executor 注册表)│
└──────────────────────┴───────────────────┴─────────────────┘
                        │ fetch (SSE / JSON)
┌───────────────────────────────────────────────────────────────┐
│              Next.js Route Handlers (Server)                  │
│  /api/generate/outline   /api/generate/scene                  │
│  /api/generate/action    /api/image-provider  /api/video-provider │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                     packages/agents                           │
│  outline_agent · scene_agent · action_agent                   │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                      packages/llm                             │
│  generate() / stream() / structuredOutput()                   │
│  + 错误码体系 + 重试/超时 + trace                              │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
│           Vercel AI SDK + Provider Adapters                   │
│  openai · anthropic · google · deepseek · openai-compatible   │
```

**核心约束：箭头只能向下依赖，不得反向。**
`packages/agents` 不允许 import 任何 Provider SDK；`packages/llm` 是**唯一**调用 LLM 的入口。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 工程 | pnpm 9 workspace · Node 22 · TypeScript 5.9 (strict) · ESLint 10 flat · Prettier 3 · Vitest 5 |
| 前端 | Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Radix UI · shadcn/ui · framer-motion |
| 状态与数据 | Zustand 5 · Immer · Dexie 4 (IndexedDB) · Zod 4 |
| AI | Vercel AI SDK 7 · `@ai-sdk/{openai,anthropic,google,deepseek,openai-compatible}` |

**Provider 覆盖**：5 个适配器覆盖 11 家模型服务 —— OpenAI / Claude / Gemini / DeepSeek 直连，
GLM、通义千问、Kimi、MiniMax、硅基流动、豆包、Grok 走 `openai-compatible` + 自定义 baseURL。

> 原则：**不因为文档里出现了某个 Provider，就强制用户必须拥有它的 Key。**

---

## 目录结构

```
AIClassRoom/
├── docs/                      # 工程文档（SSOT，14 份）
├── apps/
│   └── web/                   # Next.js 16 主应用
│       └── src/
│           ├── app/           # App Router：页面 + SSE Route Handlers
│           ├── features/      # 业务域：home / generate / classroom / settings
│           ├── stores/        # Zustand stores
│           └── lib/           # db (Dexie) / utils
└── packages/
    ├── types/                 # 领域类型 + Zod schema + 不变量校验
    ├── ui/                    # 组件库
    ├── prompts/               # 版本化 prompt
    ├── agents/                # Agent 流水线
    ├── llm/                   # LLM 唯一入口
    ├── tts/                   # TTS / ASR 抽象
    ├── db/                    # IndexedDB 持久化
    ├── runtime/               # 播放引擎（状态机）
    ├── image-service/         # 图像生成抽象
    ├── video-service/         # 视频生成抽象
    └── config/                # tsconfig / eslint 共享配置
```

---

## 快速开始

**环境要求**：Node.js >= 22、pnpm >= 9

```bash
git clone https://github.com/fanchuanxun/aiclassroom.git
cd aiclassroom
pnpm install

# 配置服务端 Key（可选，不配也能启动）
cp .env.example .env.local
# 填入 OPENAI_API_KEY / ANTHROPIC_API_KEY / ... 或
# OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_API_KEY（通义千问 / GLM / Kimi 等）

pnpm dev          # http://localhost:3000
```

也可以在页面的「设置」里填 **Browser Key**（存浏览器 IndexedDB，不落盘、不写日志）。

### 常用命令

```bash
pnpm check        # typecheck + lint + test 三连
pnpm test         # Vitest 单测
pnpm build        # 生产构建
```

---

## 工程实践

**测试**：117 个单测（12 个文件）覆盖 LLM 层、Agent 流水线、播放引擎、DB 层、SSE 客户端、密钥脱敏逻辑，以及 Provider 持久化的并发幂等与启用互斥。

**错误处理与降级**：

| 场景 | 处理 |
|---|---|
| LLM 调用失败 | 自动重试 2 次（指数退避）→ 结构化错误 + traceId + 可切换模型重试 |
| TTS 失败 | 降级为「字幕 only」，不阻塞播放 |
| 单个 Scene 生成失败 | 不阻塞其他 Scene，该 Scene 显示「重新生成」 |
| 网络断开 | 已生成内容保留，未生成提示稍后重试 |

错误码分 8 类：`LLM_ERROR` / `NETWORK_ERROR` / `VALIDATION_ERROR` / `GENERATION_ERROR` / `RUNTIME_ERROR` / `PERSISTENCE_ERROR` / `PROVIDER_ERROR` / `TIMEOUT`。

**安全边界**：
- 服务端 Key 只从环境变量读取，**永不进入浏览器**
- Browser Key 存 Dexie，随请求 body 传给服务端，服务端不落盘、不写日志
- 禁止：硬编码 Key / 提交 Key 到 Git / `console.log` Key / trace 记录 Key 或 Authorization 头

**文档即 SSOT**：14 份文档放在 `docs/`，包括 PRD、架构、Agent 架构、API、数据模型、运行时、技术栈、测试、Trace、CHANGELOG、阶段验收报告、浏览器实测报告。新依赖必须先改 `TECH-STACK.md` 再安装。

---

## 已知限制（如实标注）

### 已在真实浏览器实测通过（2026-10-07）

| 能力 | 结果 |
|---|---|
| 5 个页面 + 3 个生成端点 | ✅ 全部 HTTP 200 |
| Dexie 持久化 / 刷新后重开 | ✅ 刷新后课程仍在「课程库」 |
| 生成 → 进入课堂 → 播放 | ✅ 大纲 → 幻灯片与讲稿 → 教学动作 → 逐句讲解播放（2 场景约 275s） |
| Provider 切换（内置预设） | ✅ 设置页「设为当前」即时生效 |
| 测试连接 | ✅ `/api/provider/test` 实测 433ms 返回成功 |

完整环境、结果与证据见 [`docs/BROWSER-E2E-REPORT_2026-10-07.md`](docs/BROWSER-E2E-REPORT_2026-10-07.md)。

### 仍未验证

- **TTS 实际发声** —— 无头环境无音频输出设备，仅验证了讲解文本与播放控制渲染
- **Browser Key 浏览器填写流程** —— 实测走的是服务端环境变量回落路径，未在浏览器内填写 Key 实测
- **第二家真实厂商凭据** —— 本机仅有 DashScope 一张凭据，其余 10 家预设未逐一实测
- **性能预算**（首页 TTI < 2s、切场景 < 300ms、生成大纲 P50 < 15s 等）—— 未做性能采样，均标记 **UNVERIFIED**

### 已修复的缺陷（2026-10-07）

- **`saveUserProvider` 无条件重写全表 `enabled`**：`ensureDefaultProviders` 顺序写入 11 家内置 Provider 时，
  会把先前写入的启用项逐个关掉，最终全表 `disabled`，`activeProvider()` 回落到排序不稳定的 `providers[0]`，
  **生效的 Provider 随机**，表现为服务端 Key 被发往不匹配的 baseURL，生成直接 `PROVIDER_ERROR` 失败。
- **`ensureDefaultProviders` 无幂等保护**：`reactStrictMode` 下 effect 双调用，两次同时看到空表各 seed 一份，
  产生 22 条重复记录。

两处均已修复（含历史脏数据自愈），详见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md) 2026-10-07 段。

---

## 项目缘起

项目起点是《从零搭建 AI 智能体互动课堂》教学讲义，在讲义基础上完成了工程基座搭建、
Agent 流水线落地、SSE 流式生成链路打通、117 个单测与 14 份工程文档的补齐，
并修复了「双 app 目录遮蔽导致产品页面全部未进构建产物」等产品级缺陷。

---

## License

MIT
