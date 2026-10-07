# PLAN — 分阶段落地计划

> 每个阶段有明确 Exit Criteria，**未通过不允许进入下一阶段**。
> 阶段状态由实际命令执行结果决定，不由主观判断决定。

最近更新：2026-09-09

---

## 总览

| Phase | 主题 | 目标 | 状态 |
|---|---|---|---|
| Phase 0 | Engineering Foundation | 仓库能跑 + 调得通 LLM + 类型正确 + 本地能存 | DONE |
| Phase 1A | Product Entry | 首页 / 设置 / 模型配置 / 角色确认，能真正创建 Lesson | CODE_COMPLETE (生成侧 Server Key 已 VERIFIED；浏览器创建/持久化 E2E UNVERIFIED) |
| Phase 1B | AI Generation | Outline / Scene / Action Agent + 结构化输出 + 校验 + SSE + Trace + 失败恢复 | VERIFIED (数据/API 层真实 LLM 生成，见 PHASE_REPORT §2/§3；浏览器 E2E UNVERIFIED) |
| Phase 1C | Classroom MVP | Classroom / Teacher / Slide / 字幕 / SPEECH / SLIDE / 播放控制 / 渐进进入 | CODE_COMPLETE (生成链路已 VERIFIED；浏览器播放/Replay E2E UNVERIFIED) |
| Phase 1D | 用户自定义 API Provider 产品化 | 设置页添加自有 API（内置 11 家 + 自定义 OpenAI Compatible）、Dexie 存 Key、真实测试连接、用自己的模型生成 | VERIFIED (API/配置/持久化/安全层真实验证，见 PHASE_REPORT §7；浏览器点击流 E2E UNVERIFIED) |
| Phase 2 | Interactive Multi-Agent | AI 学生、DISCUSS / INTERACT / FOCUS / WRITE / WAIT、Quiz / Poll | NOT_STARTED |
| Phase 3 | Productization | 历史 / 持久化 / 编辑 / Replay / 导入导出 | CODE_COMPLETE |
| Phase 4 | Advanced | 云同步 / 账号 / 团队 / 协作 / 分析 / 权限 | NOT_STARTED |

---

## Phase 0 — Engineering Foundation

**目标**：打通"仓库能跑 + 调得通 LLM + 数据类型正确 + 本地能存东西"这一圈。

### 范围

1. pnpm monorepo：`apps/web` + `packages/{types,ui,prompts,agents,llm,tts,config}`
2. TypeScript 5 strict 基线（`noUncheckedIndexedAccess` 开）
3. ESLint flat config + Prettier（`no-explicit-any` / `consistent-type-imports` / `no-console`）
4. Vitest 测试基线，每个 package 至少一个冒烟测试
5. `packages/types` 完整表达 data-model（Zod schema + TS 类型 + 不变量校验）
6. `packages/ui` 6 个基础组件
7. `packages/llm` 统一抽象（resolveModel / generate / stream / structuredOutput / errors / trace）
8. `packages/prompts` 版本化 prompt
9. `packages/agents` 流水线 runner 骨架
10. `apps/web` Next.js 16 骨架 + Dexie + Zustand + `/hello` 真实 SSE 烟囱
11. `docs/` 文档体系

### Exit Criteria

```bash
pnpm install     # 必须真实成功
pnpm typecheck   # 必须 0 error
pnpm lint        # 必须 0 error
pnpm test        # 必须全绿
pnpm build       # 必须真实成功
pnpm dev         # 必须能启动
```

附加：
- `/api/generate/{outline,scene,action}` 三个真实 SSE 端点在配置有效 Provider Key 后，真实流式返回 LLM 结构化输出（**Phase 1B 数据/API 层已 VERIFIED**；浏览器内触发与持久化 E2E UNVERIFIED）
- `packages/types` 完整覆盖 data-model 的所有实体与 7 条不变量（INV-1..INV-7），由 22 个 validation 用例支撑

### 不在 Phase 0 范围

- 任何课程生成 UI
- Classroom 页面
- 云端 TTS
- 服务端数据库

---

## Phase 1A — Product Entry

**目标**：用户能真正创建 Lesson（走到"准备生成"这一步）。

- 首页：聊天式输入框 + 设置入口
- 设置弹窗：三栏（类别 / Provider / 配置面板），11 家 Provider
- API Key：Dexie 存储 + debounce 自动保存；明确区分 Server Key / Browser Key
- 角色库：5 个默认角色（1 老师 + 4 学生），emoji 唯一
- 角色确认页：Popover 勾选，至少保留 1 位老师
- 语音配置：Web Speech API 声音选择 + 语速

**Exit Criteria**：输入主题 → 选择角色 → 创建出 `Lesson` 记录（Dexie 可查），状态为 `draft`。

---

## Phase 1B — AI Generation

**目标**：真实 LLM 生成 Outline / Scene / Action。

- `outline_agent`：`topic + roles → Lesson 骨架`
- `scene_agent`：`lesson + sceneIndex → slide + script`（并行）
- `action_agent`：`scene + roles → Action[]`（并行）
- 三个 SSE 端点真实流（禁止 setTimeout / 假进度）
- 结构化输出 + Zod 校验 + 不变量校验（非法即 reject，禁止静默修）
- Trace 采集（model / tokens / latency / 错误），禁止记录 Key
- 失败恢复：Scene 级 Retry、Action 级 Retry，不影响其他 Scene

**Exit Criteria**：给定 topic 与有效 Key，能真实产出通过全部不变量校验的 `Lesson`，且 SSE 可在浏览器 Network 面板观察到真实分帧。

---

## Phase 1C — Classroom MVP

**目标**：真实播放引擎 + 渐进进入课堂。

- Classroom 三栏布局
- PlaybackEngine 状态机 + Executor Registry（SPEECH / SLIDE，其余留位）
- TTS 抽象（MVP 用 Web Speech API）
- 字幕 / 角色气泡 / 播放 / 暂停 / 继续 / 上一步 / 下一步 / 倍速
- 渐进进入：Scene 0 ready → 立即跳转 → 后台继续生成并注入 runtime

**Exit Criteria**：真实用户从主题到课堂播放全程可跑通，且 Save → 重开 → Replay 可复现。

---

## Phase 1D — 用户自定义 API Provider 产品化

**目标**：用户仅通过「设置」页即可添加自己的 API（不改代码 / 不进项目目录 / 不改 `.env.local`），并用自己的模型完成真实课程生成。

- 两类 Provider：内置 11 家预设（DashScope / DeepSeek / OpenAI / Anthropic / Google / GLM / Kimi / MiniMax / 硅基流动 / 豆包 / Grok）+ 自定义 OpenAI Compatible（用户填 名称 / API Key / Base URL / Model）
- API Key 安全：仅存浏览器 IndexedDB（Dexie `userProviders` 表），绝不用 localStorage / Lesson / corpus / trace / log / URL / 页面文本；UI 全程掩码（`sk-xxxx••••1234` / `已配置 API Key`），输入 `type="password"`
- 测试连接：`POST /api/provider/test` 发起**真实**最小 LLM 请求（非 setTimeout / 非 mock），成功显 `✓ 连接成功 / Provider / Model`，失败显 `✕ {用户可读错误码}`（401/403/429/500/timeout 映射），绝不暴露堆栈
- 保存 / 删除 / 切换：Dexie 持久化（互斥 enabled，至多 1 个 active），刷新保留
- 生成优先级链：浏览器内联 Key ＞ 服务端环境变量 ＞ PROVIDER_ERROR（与 `resolveApiKey` 一致）
- 工作室显示「正在使用：{name} · {model}」（不含 Key）

**Exit Criteria**：用户不改代码、仅通过设置页添加自己的 API（含自定义 Base URL / Model），点测试连接真实成功，保存后返回首页用该 Provider 的真实模型完成 Outline→Scene→Action 真实生成。

**验收状态（2026-09-09）**：✅ **VERIFIED（API/配置/持久化/安全层）**。两条 Provider 配置路径（P1 服务端环境变量、P2 用户自定义内联）均经真实 LLM 跑通 Outline→Scene→Action（`_e2e_pipeline_custom.txt`）；`/api/provider/test` 实测 P1 533ms / P2 447ms 成功；`typecheck/build/lint/test(94 passed)` 全绿。⚠️ UNVERIFIED：浏览器内点击流 E2E（无头环境）、第二家「真实不同厂商」凭据（本机仅 DashScope 一张）。详见 `PHASE_REPORT_2026-09-09.md` §7。

---

## Phase 2 / 3 / 4

见 `PRODUCT-SOURCE-MAP.md` 第六至十一章映射。Phase 4 不得阻塞 Phase 1。

---

## 变更规则

- 新增依赖：先改 `docs/TECH-STACK.md` 说明理由，再安装
- 新增 Action 类型：先改 `docs/DATA-MODEL.md` 与 `packages/types`，再加 executor，再注册
- 阶段完成：先更新 `PRODUCT-SOURCE-MAP.md` 状态，再更新本文件，最后写 `CHANGELOG.md`
