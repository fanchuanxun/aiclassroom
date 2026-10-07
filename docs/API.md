# API

> 服务端接口规范。所有生成接口必须是**真实 SSE 流**。

最近更新：2026-09-09

---

## 0. SSE 规范

**禁止**：`setTimeout` 假进度、静态 JSON 分片、任何形式的 fake streaming。

响应头：

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

事件帧格式（`data:` 为 JSON）：

```
event: <type>
data: <json>

```

### 事件类型（EI-01）

| 事件 | 载荷 | 说明 |
|---|---|---|
| `started` | `{ runId, agent, node }` | 流水线开始 |
| `progress` | `{ node, message, at }` | 节点进度（真实节点进入时触发） |
| `partial` | `{ node, text }` | 模型流式输出的真实增量 |
| `outline_ready` | `{ lesson }` | 大纲产物 |
| `scene_ready` | `{ sceneIndex, scene }` | 单个 Scene 产物 |
| `action_ready` | `{ sceneIndex, actions }` | 单个 Scene 的 Action[] |
| `trace` | `{ trace: TraceRecord }` | 单次 LLM 调用元数据（不含 Key） |
| `error` | `{ code, message, retryable, traceId? }` | 结构化错误 |
| `done` | `{ runId }` | 结束 |

客户端断连时服务端必须中止 LLM 调用（AbortSignal）。

---

## 1. `POST /api/hello`

Phase 0 端到端烟囱：真实流式调用 LLM。

**Request**

```json
{ "prompt": "用一句话解释什么是 AI 智能体", "model": { "provider": "openai", "modelId": "gpt-4o-mini" }, "apiKey": "<optional browser key>" }
```

**Response**：SSE，事件序列 `started → partial* → done | error`

---

## 2. `POST /api/generate/outline`

**Request**

```json
{
  "topic": "人工智能是什么？",
  "language": "zh-CN",
  "roles": [ /* Role[] */ ],
  "materials": [ /* Material[]，可选 */ ],
  "model": { "provider": "openai", "modelId": "gpt-4o" }
}
```

**Response**：SSE → `started → progress → partial* → outline_ready → done`

---

## 3. `POST /api/generate/scene`

**Request**

```json
{ "lesson": { /* Lesson 骨架 */ }, "sceneIndex": 0, "model": { ... } }
```

**Response**：SSE → `started → progress → partial* → scene_ready → done`

---

## 4. `POST /api/generate/action`

**Request**

```json
{ "lesson": { ... }, "sceneIndex": 0, "model": { ... } }
```

**Response**：SSE → `started → progress → action_ready → done`

产出 `Action[]` 必须通过 Zod schema + 领域不变量校验；不通过则发 `error`（`VALIDATION_ERROR`）并附 `traceId`，**不产出半成品**。

---

## 5. 错误响应

统一结构：

```json
{
  "code": "PROVIDER_ERROR",
  "message": "用户可读的中文说明",
  "retryable": true,
  "traceId": "xxx"
}
```

错误码：

| code | 含义 | 可重试 |
|---|---|---|
| `LLM_ERROR` | 模型返回错误 | 视情况 |
| `NETWORK_ERROR` | 网络失败 | 是 |
| `PROVIDER_ERROR` | Provider 配置/鉴权错误 | 否（需改配置） |
| `TIMEOUT` | 调用超时 | 是 |
| `VALIDATION_ERROR` | 产物不符合 schema / 不变量 | 是（重生成） |
| `GENERATION_ERROR` | 生成流程失败 | 是 |
| `RUNTIME_ERROR` | 运行时异常 | 否 |
| `PERSISTENCE_ERROR` | 本地存储失败 | 是 |

---

## 6. API Key 传递

- 服务端环境变量优先（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / ...）
- 若请求体带 `apiKey`（浏览器本地配置），仅在该次请求内存中使用，**不落盘、不写日志、不进 trace**
- 服务端绝不把 server key 回传给浏览器
