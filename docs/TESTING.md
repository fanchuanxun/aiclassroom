# TESTING

> 测试与开发同步。**禁止为了通过测试而修改测试。**

最近更新：2026-09-09

---

## 1. 测试分层

| 层 | 工具 | 覆盖对象 |
|---|---|---|
| Unit | Vitest | 纯函数：类型校验、不变量、状态机 reducer、executor（注入 mock context）、prompt 渲染、错误分类 |
| Schema | Vitest + Zod | 领域 schema：合法样本通过、非法样本被拒 |
| Agent | Vitest + Mock Provider | Agent 流水线在受控 LLM 输出下的行为（含失败/非法输出分支） |
| API | Vitest + 真实 Route Handler | SSE 端点：事件序列、错误码、非法输入 |
| Runtime | Vitest | PlaybackEngine 状态转换、executor registry、取消 |
| Persistence | Vitest + fake-indexeddb | Dexie 读写、版本迁移 |

E2E（浏览器真实链路）为后续补充，当前不作为 Phase 0 门禁。

---

## 2. 必须验证的核心

- Lesson / Scene / Action 创建
- Schema validation（合法 + 非法）
- Executor 行为
- Playback 状态转换
- SSE 事件序列
- LLM 抽象（含错误与超时）
- 生成流水线（Mock Provider）
- Persistence（Dexie）

---

## 3. 必须故意测试的非法情况

| 非法输入 | 期望 |
|---|---|
| 不存在的 `roleId` | `ValidationError`，INV-2 |
| 不存在的 `elementId`（FOCUS） | `ValidationError`，INV-3 |
| `FOCUS.elementId` 属于**其他** Scene 的 slide | `ValidationError`，INV-3 |
| 错误的 scene index | `ValidationError`，INV-1 |
| 未知 Action type | `ValidationError` |
| 重复 Role id | `ValidationError`，INV-5 |
| 空 Lesson / 空 Scene | 明确拒绝或按 schema 报错 |
| Provider error | `PROVIDER_ERROR`，可提示换配置 |
| LLM timeout | `TIMEOUT`，重试后仍失败则报错 |
| SSE 中断 | 客户端收到不完整流 → 报错且不写入半成品 |

**判定标准**：系统必须**正确失败**，而不是「假装成功」。

---

## 4. Mock 使用规则

- Mock **只能**出现在：`*.test.ts` / `packages/llm/src/testing/` / `packages/agents/src/__fixtures__/`
- Mock 文件必须标注 `// MOCK — TEST ONLY`
- **生产实现禁止 import 任何 mock**
- 用 lint 规则或目录约定隔离（CI 可加检查）

---

## 5. 命令

```bash
pnpm test          # 全量
pnpm test:watch
pnpm test:cov
```

---

## 6. 禁止

- 测试只验证「页面能打开」
- 测试只验证 HTTP 200
- 修改测试来掩盖代码问题
- 编造测试结果
- 未运行命令却声称运行成功
