# TECH-STACK

> 技术栈基线。**新依赖必须先改本文件并说明理由，再安装。**

最近更新：2026-09-09

---

## 1. 选型原则

1. 够用即可：不追求最新最酷，追求最稳定最适合
2. 统一标准：同一类功能只用一个技术方案
3. 禁止自由引入：新依赖先改文档再装

---

## 2. 已选定技术

### 工程

| 技术 | 版本 | 用途 | 来源 |
|---|---|---|---|
| pnpm | 9.15.9 | 包管理器 / workspace | 讲义 SR-2.A |
| Node.js | 22.22.2 | 运行时 | 环境实际 |
| TypeScript | 5.9.x | 类型（strict） | 讲义 SR-2.3 + PD-03 |
| ESLint | 10.x（flat config） | 静态检查 | 讲义 SR-5.4 |
| Prettier | 3.x | 格式化 | 讲义 SR-5.4 |
| Vitest | 5.x | 单元 / 集成测试 | 讲义 SR-5.5 |

### 前端

| 技术 | 版本 | 用途 | 来源 |
|---|---|---|---|
| Next.js | 16.x（App Router） | 全栈框架 | 讲义 SR-2.1 |
| React | 19.x | UI 运行时 | 讲义 SR-2.2 |
| Tailwind CSS | 4.x | 样式（@theme token） | 讲义 SR-2.4 |
| Radix UI Primitives | 最新 | 无障碍基础组件 | 讲义 SR-2.5 |
| shadcn/ui（复制粘贴模式） | — | 项目级组件库 | 讲义 SR-2.6 |
| lucide-react | 最新 | 图标 | 讲义 SR-2.7 |
| framer-motion | 最新 | 动效 | 讲义 SR-2.8 |
| Tiptap | 最新 | 富文本 | 讲义 SR-2.9（Phase 3） |
| ECharts | 最新 | 图表 | 讲义 SR-2.10（Phase 3） |
| @xyflow/react | 最新 | 流程图 / DAG | 讲义 SR-2.11（Phase 3） |

### 状态与数据

| 技术 | 版本 | 用途 | 来源 |
|---|---|---|---|
| Zustand | 5.x | 客户端状态 | 讲义 SR-2.13 |
| Immer | 最新 | 不可变更新 | 讲义 SR-2.13 |
| Dexie | 4.x | IndexedDB 持久化 | 讲义 SR-2.14 |
| react-hook-form | 最新 | 表单 | 讲义 SR-2.15 |
| Zod | 4.x | 运行时校验 + 类型推导 | 讲义 SR-2.15 + 项目需求 |
| next-intl | 最新 | i18n | 讲义 SR-2.16（Phase 1A） |

### AI

| 技术 | 版本 | 用途 | 来源 |
|---|---|---|---|
| Vercel AI SDK (`ai`) | 7.x | 统一 LLM 接入 | 讲义 SR-2.17 |
| `@ai-sdk/openai` | 4.x | OpenAI 适配 | 讲义 SR-2.20 |
| `@ai-sdk/anthropic` | 4.x | Anthropic 适配 | 讲义 SR-2.20 |
| `@ai-sdk/google` | 4.x | Google 适配 | 讲义 SR-2.20 |
| `@ai-sdk/deepseek` | 3.x | DeepSeek 适配 | 讲义 SR-2.20 |
| `@ai-sdk/openai-compatible` | 3.x | OpenAI 协议兼容适配 | 讲义 SR-2.20 + PD-02 |

**Provider 覆盖策略（PD-02）**：讲义列出 11 家 Provider，本项目用 5 个适配器覆盖：

| Provider | 适配器 |
|---|---|
| OpenAI | `openai` |
| Claude (Anthropic) | `anthropic` |
| Gemini (Google) | `google` |
| DeepSeek | `deepseek` |
| GLM（智谱）、通义千问、Kimi、MiniMax、硅基流动、豆包、Grok | `openai-compatible`（自定义 baseURL） |

> 原则：**不因为文档中出现某个 Provider 就强制用户必须拥有该 Provider 的 Key。**

---

## 3. 明确禁止引入

| 禁止 | 替代 |
|---|---|
| CSS-in-JS（styled-components / emotion） | Tailwind CSS |
| Redux / Jotai / MobX | Zustand + Immer |
| Slate / Lexical / Quill | Tiptap |
| Chart.js / Recharts | ECharts |
| 自写 LLM Provider HTTP 客户端 | Vercel AI SDK |
| Lodash | 原生 JS + 自写 util |
| Moment.js | date-fns |
| 任何 `any` | 显式类型 / `unknown` + 收窄 |

---

## 4. 关键 lint 规则

- `no-explicit-any`：error
- `consistent-type-imports`：error（强制 `import type`）
- `no-console`：warn（生产代码禁止 `console.log` 输出敏感信息）

---

## 5. 环境要求

- Node.js >= 22
- pnpm >= 9（`npm i -g pnpm@9.15.9`）
- npm registry：默认使用 `https://registry.npmmirror.com`（本机已配置）
