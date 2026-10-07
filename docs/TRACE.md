# TRACE — 可观测性

最近更新：2026-09-09

---

## 1. 目的

每次 LLM 调用必须留下可追溯记录，用于：定位生成失败、统计成本与延迟、对比模型效果。

---

## 2. 记录内容

```ts
interface TraceRecord {
  id: string;
  lessonId?: string;
  sceneId?: string;
  agent: string;        // outline_agent / scene_agent / action_agent / teacher_agent ...
  node: string;         // retrieve / plan / draft / validate / critique / finalize
  provider: string;     // openai / anthropic / google / deepseek / openai-compatible
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd?: number;
  status: "ok" | "error";
  startedAt: string;    // ISO 8601
  finishedAt: string;
  error?: { code: string; message: string; stack?: string };
}
```

`usage`（inputTokens / outputTokens）仅在 Provider 返回时填充，缺失为 `0`，**不编造**。

---

## 3. 安全红线（强制）

**绝不记录**：

- API Key
- `Authorization` header
- 任何 Secret
- 完整的 request/response header
- 用户敏感信息

**措施**：

- Trace 由 `packages/llm` 统一构造，字段白名单化，不接受任意对象
- 错误信息经过 sanitize：移除 `sk-` 等形态的字符串
- Trace 落 Dexie `traces` 表，导出时默认脱敏

---

## 4. 采集点

```
packages/llm/src/generate.ts / stream.ts / structured.ts
   → withTrace({ agent, node, provider, model }, fn)
       → 记录 startedAt / finishedAt / latencyMs / usage / status / error
```

`withTrace` 是**唯一**产生 TraceRecord 的地方，业务代码不得自行构造。

---

## 5. 流向

1. 服务端调用产生 TraceRecord
2. 通过 SSE `trace` 事件实时推给前端
3. 前端 `traceStore` 收集，展示在「生成进度 / Agent trace」面板
4. 落 Dexie `traces` 表（索引：`id, lessonId, startedAt`）

---

## 6. 当前状态

- 类型定义：`packages/types/src/trace.ts` — NOT_STARTED
- 采集器：`packages/llm/src/trace.ts` — NOT_STARTED
- 前端面板：Phase 1B
