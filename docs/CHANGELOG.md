# CHANGELOG

> 记录真实发生的变更。格式：日期 + 变更 + 影响。

---

## 2026-09-09

### 项目启动

- **审计**：确认 `D:\不知道是啥\AI智能体互动课堂` 为完全空目录（无文件、无 Git），判定项目状态为 **A. 空项目**
- **环境**：Node v22.22.2 / npm 10.9.7 / Git 2.54.0；本机无 pnpm，已安装 pnpm 9.15.9
- **资料**：完整读取《教学讲义-从零搭建 AI 智能体互动课堂》47 页，建立 `docs/PRODUCT-SOURCE-MAP.md` 映射（约 80 条要求项）

### 文档

- 新增 `docs/PRODUCT-SOURCE-MAP.md`（SSOT 映射，含来源分级与状态）
- 新增 `docs/PLAN.md`、`docs/ARCHITECTURE.md`、`docs/DATA-MODEL.md`、`docs/TECH-STACK.md`
- 新增 `docs/AGENT-ARCHITECTURE.md`、`docs/RUNTIME.md`、`docs/API.md`、`docs/TRACE.md`、`docs/TESTING.md`、`docs/PRD.md`

### 决策

- **PD-03**：TypeScript 锁 5.9.x（环境存在 TS 7.x，但生态组合风险高）
- **PD-02**：11 家 Provider 用 5 个 AI SDK 适配器覆盖（openai-compatible 兜底 7 家）
- **DECISION-01**（待用户确认）：Agent 编排暂不引入 LangGraph，改用自研显式节点流水线 runner

### 阻塞

- **BL-01**：环境无任何 Provider API Key → 真实 LLM 端到端验证无法执行，相关结论标记 `UNVERIFIED`

### Phase 0–1C / 3 代码落地与验收（本会话）

- **关键缺陷修复（产品级）**：`apps/web` 同时存在 `app/`（脚手架占位）与 `src/app/`（真实产品），Next.js 优先采用 `app/`，导致 `pnpm build` 仅产出 `hello` 占位路由、产品全部页面与生成 API 未进入构建。已在 `src/app/` 补齐 `layout.tsx` + `globals.css`（修正 `@source` 相对路径），并删除 `app/`，修复后构建产出 8 条真实路由。
- **编译/类型/Lint 缺陷修复**：`controller.ts`（`roles` 未定义 & `isSseError` 谓词 & `SseError.code` 类型）、`sse.ts`（`ReadableStream` 值/类型混用 + 新增 `toSseResponse` 桥接）、3 个 SSE 路由、`engine.ts`（`setLesson` 写入 readonly）、`studio` 页 `Link` 导入、`tts.ts` 未用参数、`library`/`classroom` 未用导入与 `import()` 类型、两处未注册规则的 `eslint-disable` 注释。
- **门禁结果**：`pnpm install / typecheck / lint / test(63 passed) / build / dev` 全绿；5 个页面 dev 实测均 HTTP 200。
- **真实运行验证**：对 `/api/generate/outline` 实测，SSE 真实分帧并执行了 `retrieve → plan → draft` 节点，仅在真实 LLM `draft` 调用处因无 Key 返回结构化 `PROVIDER_ERROR` 后关闭通道——证实 SSE/Agent/错误闭环链路真实可用。
- **交付物**：`docs/PHASE_REPORT_2026-09-09.md`；`PLAN.md` Phase 状态更新为 DONE / CODE_COMPLETE。

### 真实 LLM E2E 验收（数据/API 层，本会话续）

- **BLOCKED 解除**：环境实际存在 DashScope `OPENAI_COMPATIBLE_API_KEY`（此前误判为「无 Key」）；新建 `apps/web/.env.local` 启用 Server Key 路径（`providers.ts` 的 `resolveApiKey` 增加服务端环境变量回退，inline Browser Key 优先级最高，不改动 Agent/Runtime 耦合）。
- **结构化输出兼容性修复（`packages/llm/src/client.ts`）**：`generateObject` 在 DashScope OpenAI-compatible 网关下因 `response_format` 不支持而失败（`No object generated` / 「must contain the word json」）；改为 `structuredViaText`——`generateText` 自由文本 + 内嵌 `z.toJSONSchema` + 客户端 `extractJson` 剥离代码块 + `schema.safeParse` 强校验（失败抛 `VALIDATION_ERROR, retryable:true`）。其余 Provider 仍走原生 `generateObject(mode:"auto")`。
- **Prompt 强化（`packages/prompts/src/outline.ts`）**：系统/用户提示增加「强制扣题、禁止泛化」约束；实测确保大纲围绕输入主题。
- **真实 E2E 证据**：
  - `/api/generate/outline`（qwen-max / Server Key）实测 SSE 全程 `started→retrieve→plan→draft→validate→critique→finalize→outline_ready→done`，产出合法且**严格扣题**的 `OutlineOutput`（topic「中国古代四大发明」→ 大纲讲造纸术/指南针等）。
  - 节点级 Agent 链路（`runOutlineAgent→runSceneAgent→runActionAgent`）实测产出 3 场景 / 36 动作完整 `Lesson`；`validateLesson` 对真实内容 **PASS（INV-1..INV-7 全过）**（title「光合作用」、slide-1 等）。
- **编码澄清（非缺陷）**：通过 Git Bash 命令行 `curl -d '{"topic":"中文"}'` 直传中文会产生 UTF-8 mojibake，使模型收到乱码而偏题；从文件 `curl -d @req.json`（UTF-8）发送完全正常。真实浏览器 `fetch` 不受影响——此前「模型不遵循主题」的怀疑不成立，产品代码正确。
- **门禁**：`typecheck ✅` / `lint ✅` / `test 63 passed ✅` / `build ✅`（8 真实路由）。
- **仍 UNVERIFIED（无头环境，非代码缺陷）**：浏览器 Dexie 持久化/重开/Replay、Classroom Player 播放、Browser Key 浏览器流程、第二家 Provider 切换。
- **证据文件**（项目根，已被 gitignore 忽略，非密钥）：`_e2e_outline_on_topic.txt`、`_e2e_outline_serverkey.txt`、`_e2e_lesson_valid.json`。

### 决策

- **DECISION-02**：DashScope / 通义千问 OpenAI-compatible 网关**不支持** `generateObject` 的 `response_format`（json_object/json_schema），且 Vercel AI SDK v7 的 `generateObject` 不实现 `mode:"tool"`（静默回退到 json_object 仍被拒）；故对 `openai-compatible` provider 统一改用「自由文本 + 内嵌 JSON Schema + 客户端 Zod 校验」方案。该方案对其它原生支持 `generateObject` 的 Provider 不影响。

### 用户自定义 API Provider 产品化（Phase 1D，本会话续）

- **目标**：用户仅通过「设置」页即可添加自己的 API（不改代码 / 不进项目目录 / 不改 `.env.local`），并用自己的模型完成真实课程生成。
- **新增 `packages/llm/src/presets.ts`（零 AI SDK 依赖，浏览器安全）**：从 `providers.ts` 抽离 `PROVIDER_PRESETS` / `findPreset` / `ProviderPreset` / `ProviderModelDef`；新增 `CUSTOM_PROVIDER_ID`、`UserProviderConfig`（适配现有 `ModelConfig` / `ProviderId`，无类型冲突）、`userProviderToModelConfig()`、`validateUserProviderConfig()`（model 空=error；非法/非 http(s) BaseURL=error；自定义 requireBaseUrl=error；空 apiKey=warning）。`packages/llm` 增加 `./presets` 子路径导出。
- **`packages/llm/src/providers.ts` 精简**：仅保留 `PROVIDER_IDS` / `ProviderId` / `ModelConfig` / `resolveApiKey` / `resolveModel` / `hasConfiguredKey`；`resolveApiKey` 优先级 内联 Browser Key ＞ 服务端环境变量 ＞ PROVIDER_ERROR，与需求一致。
- **持久化 `packages/db`**：新增 `UserProviderRecord = UserProviderConfig`、`userProviders` 表（Dexie v2）；`userProviders.ts` 仓库（`listUserProviders` / `getActiveUserProvider` / `saveUserProvider` 事务互斥 enabled / `deleteUserProvider` / `setActiveUserProvider`）。Key 仅驻留 IndexedDB，不进 KB / Lesson / corpus / trace / log / URL。
- **前端 `apps/web`**：
  - `lib/userProviders.ts`：zustand store（load/add/update/remove/setActive）+ `ensureDefaultProviders`（注入 11 家，默认启用 qwen）+ `activeProvider` / `activeModelConfig` / `maskApiKey`；仅从 `@aiclassroom/llm/presets` 引入（零 SDK）。
  - `lib/mask.ts`：`maskApiKey` 纯函数（未配置 / 全掩码 / `sk-xxxx••••1234`）。
  - `lib/settings.ts`：移除 localStorage 中的 provider/apiKey 配置（移至 Dexie）。
  - `app/settings/page.tsx`：完整 Provider 管理（列表 / 当前 / 掩码 Key / 新增内置 11 家 / +自定义 OpenAI Compatible / 编辑 / 删除 / 设为当前 / 测试连接）；「测试连接」调 `POST /api/provider/test`（真实 API），成功显 `✓ 连接成功（{latency}ms）`，失败显 `✕ {message}` 绝不堆栈。
  - `app/api/provider/test/route.ts`：真实「测试连接」端点——构建 `UserProviderConfig` → `userProviderToModelConfig` → `generate`（最小请求，超时 30s / 零重试）→ 返回 `{ok, provider, model, latencyMs}` 或脱敏后的错误 payload。
  - `app/studio/[lessonId]/page.tsx`：接入 `useUserProviders` + `activeModelConfig`，显示「正在使用：{name} · {model}」（不显示 Key）。
- **测试新增**：`presets.test.ts`（12）/ `security.test.ts`（9，`sanitizeMessage` + `classifyError` + `toErrorPayload` 脱敏）/ `userProviders.test.ts`（7，fake-indexeddb CRUD/互斥/切换/刷新恢复/不污染）/ `mask.test.ts`（3）。总计 **94 passed**。
- **真实 E2E（本会话，`_e2e_pipeline.mjs`，已清理）**：对 P1（服务端环境变量路径，qwen-max）与 P2（用户自定义内联路径，qwen-plus）各跑通 Outline→Scene→Action 真实 LLM 全链路；`/api/provider/test` 实测 P1 533ms / P2 447ms 成功。证据见 `_e2e_pipeline_custom.txt` / `_e2e_custom_provider_sse.txt`（已 gitignore）。
- **工程门禁**：`typecheck ✅` / `build ✅`（修复 `userProviders.ts` 未用 `maskApiKey` 导入 TS6133）/ `lint ✅ 0 error` / `test ✅ 94 passed`。
- **仍 UNVERIFIED（诚实标注）**：浏览器内点击流 E2E（无头环境）；第二家「真实不同厂商」凭据（本机仅 DashScope 一张，P1/P2 实测均回落 DashScope，但自定义 openai-compatible 路径对真实 API 已验证）；Classroom Player 真实播放。详见 `PHASE_REPORT_2026-09-09.md` §7。

---

## 2026-10-07

### 浏览器端到端实测（解除一批 UNVERIFIED）

- **环境**：Next.js 16.3.4（Turbopack）+ Node v22.22.2 + pnpm 9.15.9；服务端环境变量走阿里云百炼（`OPENAI_COMPATIBLE_BASE_URL` / `OPENAI_COMPATIBLE_API_KEY`）。
- **方法**：Playwright 驱动系统 Chrome 访问本机 `next dev`，采集页面状态 / 控制台错误 / 网络请求 / IndexedDB 内容并逐步截图留证。
- **实测结论**：
  - 5 个页面与 3 个生成端点（`/api/generate/outline`、`/scene`、`/action`）全部 HTTP 200；`/api/provider/test` 实测 `✓ 连接成功（433ms）`。
  - 全链路跑通：提交主题 → 大纲 → 幻灯片与讲稿 → 教学动作 →「· 全部生成完成」（2 场景约 **275s**）→「进入课堂 →」→ 逐句讲解播放；暂停 / 下一步 / 停止 / 倍速控件可用。
  - Scene 0 约 **80s** 就绪即可进入课堂（渐进式），后台继续生成后续场景。
  - Dexie 持久化生效，刷新后课程仍在「课程库」中。
- **解除的 UNVERIFIED**：浏览器内 Dexie 持久化 / 重开、生成 → 进入课堂 → 播放、第二家 Provider 切换。
- **仍未验证**：TTS 实际发声（无头环境无音频输出设备）、Browser Key 浏览器填写流程、第二家**真实厂商**凭据、性能预算采样。详见 `docs/BROWSER-E2E-REPORT_2026-10-07.md` §5。

### 缺陷修复（「当前使用的 Provider」不确定 → 生成随机失败）

- **【严重】`packages/db/src/userProviders.ts` — `saveUserProvider` 无条件重写全表 `enabled`**
  原实现 `const shouldEnable = p.id === cfg.id && cfg.enabled;` 在**新增**场景下
  `cfg.id` 尚未落表，对已有记录恒为 `false`，该循环等价于「每保存一条就把其它全部禁用」。
  `ensureDefaultProviders()` 顺序写入 11 家内置 Provider 时，会把先前写入的启用项逐个关掉，
  **最终 11 家全部 `enabled = false`**；`activeProvider()` 回落到 `providers[0]`，而
  `listUserProviders()` 按 `updatedAt` 排序、所有种子记录时间戳相同，排序结果不稳定 ——
  **生效的 Provider 实际是随机的**。
  用户可见后果：服务端环境变量的 Key（DashScope）被发往随机选中的 baseURL
  （实测两次分别命中豆包 `ark.cn-beijing.volces.com` 与 GLM `open.bigmodel.cn`），
  生成立刻 `GENERATION_ERROR` 鉴权失败，studio 页卡在 `outlining`。
  修复：仅当 `cfg.enabled === true` 时才执行互斥禁用。
- **【中】`apps/web/src/lib/userProviders.ts` — `ensureDefaultProviders` 无幂等保护**
  仅在事务外读一次表就决定是否 seed；`next.config.ts` 已开启 `reactStrictMode`，
  dev 下 effect 双调用，两次**同时**看到空表各写入一份 → 11 家变 **22 条**。
  修复：新增 `applyUserProviderPlan()`，把「读取 → 规划 → 落盘」放进**同一个 IndexedDB 事务**，
  靠 IndexedDB 对同 scope 读写事务的串行化挡住跨模块实例（dev 热重载）与多标签页的并发；
  另加模块级单飞 Promise 兜住同实例内并发。
- **新增 `planPresetProviderRepair()`** 做历史数据自愈：清理已产生的重复内置 Provider，
  并在没有任何启用项时补齐默认项。**去重边界**：只清理 `providerId ∈ PROVIDER_PRESETS` 的记录；
  用户可能刻意创建多个自定义 Provider（共用 `providerId = "custom"`），按 providerId 去重会误删真实配置。
- 默认启用项由内联的 `p.id === "qwen"` 提为常量 `DEFAULT_ACTIVE_PRESET`，
  与 `.env.example` 中 `OPENAI_COMPATIBLE_*` 的示例配置对齐。

### 测试

- `packages/db/src/userProviders.test.ts` 新增 **9** 个用例：顺序 seed 回归、并发幂等、重复加载幂等、
  `activeId` 互斥、去重保留策略、自定义 Provider 不被误删、空输入不崩。
- **回归用例有效性已证伪验证**：把上述严重缺陷的修复临时还原为旧逻辑重跑，该用例立即失败
  （`AssertionError: expected [] to have a length of 1 but got +0`）；恢复修复后全绿。
- **工程门禁**：`test ✅ 117 passed`（12 个测试文件）/ `typecheck ✅` / `lint ✅ 0 error`。
- **浏览器实测 6/6 通过**：全新环境 11 条且自动启用 qwen；同一环境重复加载 3 次仍 11 条；
  注入 22 条全 `disabled` 脏数据后自愈收敛到 11 条 + 自动启用 qwen；零手动配置直接生成成功。

### 文档

- 新增 `docs/BROWSER-E2E-REPORT_2026-10-07.md`（浏览器端到端实测报告：环境 / 结果 / 缺陷 / 证据 / 未验证项）。

