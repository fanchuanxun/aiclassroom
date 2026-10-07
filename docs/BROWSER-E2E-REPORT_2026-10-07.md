# 浏览器端到端实测报告

> 日期：2026-10-07
> 范围：在**真实浏览器**中完成此前标记为 `UNVERIFIED` 的端到端链路验证，并修复过程中暴露的两个 Provider 缺陷。
> 方法：Playwright 驱动系统 Chrome（headless）访问本机 `next dev`，采集页面状态、控制台错误、网络请求与 IndexedDB 内容，逐步截图留证。
> 原则：只记录真实观测到的结果；未执行的步骤明确标注 `未执行`。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 运行目录 | 项目根（含 `node_modules` 与 `apps/web/.env.local`） |
| Node / 包管理器 | v22.22.2 / pnpm 9.15.9 |
| 框架 | Next.js 16.3.4（Turbopack） |
| 访问地址 | `http://localhost:3000` |
| 已配置 Provider | `OPENAI_COMPATIBLE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`（阿里云百炼）+ `OPENAI_COMPATIBLE_API_KEY`（服务端环境变量） |
| 驱动方式 | `playwright-core` + 系统 Chrome（`executablePath`），未下载额外浏览器 |

> ⚠️ **必须用 `localhost` 访问**。Next.js 16 默认阻止跨源 dev 资源，使用 `127.0.0.1:3000` 会持续产生
> `Blocked cross-origin request to Next.js dev resource /_next/hmr` 与 WebSocket 握手失败日志。
> 仅影响 HMR 热更新，不影响功能，但会淹没真实报错。

---

## 2. 实测结果

### 2.1 页面与端点

| 项 | 结果 | 证据 |
|---|---|---|
| `GET /` 首页 | ✅ 200，表单（主题 / 语种 / 场景数 / 角色）完整渲染 | 截图 `01-home.png` |
| `GET /library` 课程库 | ✅ 200 | 截图 `02-library.png` |
| `GET /settings` 设置 | ✅ 200，11 家内置 Provider 卡片 + 测试连接 / 编辑 / 设为当前 / 删除 | 截图 `40-settings-active.png` |
| `POST /api/provider/test` | ✅ 200，`✓ 连接成功（433ms）` | 实测输出 |
| `POST /api/generate/outline` | ✅ 200，SSE 真实产出 `OutlineOutput` | 实测输出 |
| `POST /api/generate/scene` | ✅ 200 | 实测输出 |
| `POST /api/generate/action` | ✅ 200 | 实测输出 |
| `GET /studio/{lessonId}` | ✅ 200，节点进度与场景列表实时更新 | 截图 `52-studio-generating.png`、`60-studio-complete.png` |
| `GET /classroom/{lessonId}` | ✅ 200，幻灯片 + 讲解字幕 + 播放控制可用 | 截图 `62-classroom-*.png` |

### 2.2 端到端全链路

| 环节 | 观测结果 |
|---|---|
| 提交主题「为什么天空是蓝色的？」 | 跳转 `/studio/{id}`，状态 `outlining` |
| 大纲生成 | 「课程大纲 2 个场景 · 预计 25 分钟」，场景 1「光的颜色与散射基础」 |
| 幻灯片与讲稿 | 标题 + 要点（如「瑞利散射：波长较短的光（如蓝光）比波长较长的光（如红光）更容易被空气中的分子散射」） |
| 教学动作 | 「正在编排教学动作…」→「动作定稿」 |
| 全部完成 | 约 **275s**（2 场景，qwen-max）；顶部出现「· 全部生成完成」 |
| Scene 0 就绪 | 约 **80s** 后按钮由「场景生成中…」变为「进入课堂 →」（渐进式进入，后台继续生成） |
| 进入课堂 | `router.push(/classroom/{id})` 成功 |
| 课堂播放 | 点击「开始上课」后逐句播报，例：「大家好，我是林老师。今天我们要一起探讨一个有趣的问题：为什么天空是蓝色的？」 |
| 播放控制 | 暂停 / 下一步 / 停止、0.5x–2x 倍速均渲染可用 |
| 配图 | ⚠️ 未生成（未配置 image provider），显示占位符——**符合预期**，非缺陷 |

### 2.3 Dexie 持久化

✅ 生成过程中 IndexedDB（库 `aiclassroom`）真实写入 `lessons` / `userProviders` 表；
刷新页面后课程仍在「课程库」中可读。

---

## 3. 实测暴露的缺陷与修复

### 3.1 【严重】`saveUserProvider` 无条件重写全表 `enabled`

**文件**：`packages/db/src/userProviders.ts`

**原实现**

```ts
const all = await db.userProviders.toArray();
for (const p of all) {
  const shouldEnable = p.id === cfg.id && cfg.enabled;
  if (p.enabled !== shouldEnable) {
    await db.userProviders.update(p.id, { enabled: shouldEnable });
  }
}
```

**根因**：新增场景下 `cfg.id` 尚未落表，`p.id === cfg.id` 对已有记录恒为 `false`，
因此 `shouldEnable` 恒为 `false` —— 该循环等价于「**每保存一条就把其它全部禁用**」。

`ensureDefaultProviders()` 顺序写入 11 家内置 Provider：第 6 家 `qwen` 被置为
`enabled: true`，但第 7 家 `kimi` 保存时又把 `qwen` 关掉，此后依次如此。
**最终 11 家全部 `enabled = false`**，`activeProvider()` 回落到 `providers[0]`，
而 `listUserProviders()` 按 `updatedAt` 排序、所有种子记录时间戳相同 —— 排序结果不稳定，
**生效的 Provider 实际是随机的**。

**用户可见后果**：服务端环境变量的 Key（DashScope）被发往随机选中的 baseURL
（实测两次分别命中豆包 `ark.cn-beijing.volces.com` 与 GLM `open.bigmodel.cn`），
生成立刻返回 `GENERATION_ERROR` 鉴权失败，且 studio 页状态卡在 `outlining`。

**修复**：仅当 `cfg.enabled === true` 时才执行互斥禁用。

```ts
if (cfg.enabled) {
  const all = await db.userProviders.toArray();
  for (const p of all) {
    if (p.id !== cfg.id && p.enabled) {
      await db.userProviders.update(p.id, { enabled: false });
    }
  }
}
await db.userProviders.put(cfg);
```

### 3.2 【中】`ensureDefaultProviders` 无幂等保护，重复 seed

**文件**：`apps/web/src/lib/userProviders.ts`

**根因**：仅在事务外读一次表就决定是否 seed。`next.config.ts` 已开启 `reactStrictMode`，
dev 下 effect 被调用两次，两次调用**同时**看到空表，各写入一份 → 11 家变 **22 条**。

**修复**（两层）：

1. 新增 `applyUserProviderPlan(plan)`：把「读取 → 规划 → 落盘」放进**同一个 IndexedDB 事务**。
   IndexedDB 对同 scope 的读写事务天然串行化，因此跨模块实例（dev 热重载）、多标签页的
   并发调用也不会重复写入。**仅在事务外先读再进事务写无法防住这种竞争**。
2. `ensureDefaultProviders` 增加模块级单飞 Promise，兜住同一模块实例内的并发。

同时新增 `planPresetProviderRepair()` 做**历史数据自愈**：清理已产生的重复内置 Provider，
并在没有任何启用项时补齐默认项。

> **去重边界（重要）**：只清理 `providerId ∈ PROVIDER_PRESETS` 的记录。
> 用户可能刻意创建多个自定义 Provider（它们共用 `providerId = "custom"`），
> 按 providerId 去重会误删真实配置。

默认启用项由内联的 `p.id === "qwen"` 提为常量 `DEFAULT_ACTIVE_PRESET`，
与 `.env.example` 中 `OPENAI_COMPATIBLE_*` 的示例配置对齐。

---

## 4. 验证证据

### 4.1 单元测试

- `packages/db/src/userProviders.test.ts` 新增 **9** 个用例：顺序 seed 回归、并发幂等、
  重复加载幂等、`activeId` 互斥、去重保留策略、自定义 Provider 不被误删、空输入不崩。
- **回归测试有效性已证伪验证**：把 3.1 的修复临时还原为旧逻辑重跑，
  新增用例立即失败（`AssertionError: expected [] to have a length of 1 but got +0`），
  证明该用例确实能捕获此缺陷；恢复修复后全绿。
- 全套门禁：**`test ✅ 117 passed`（12 个测试文件）** / **`typecheck ✅`** / **`lint ✅ 0 error`**。

### 4.2 浏览器实测（6/6 通过）

| 用例 | 预期 | 实测 |
|---|---|---|
| 全新环境首次加载 | 11 条记录 + 自动启用 qwen | ✅ 11 条，`enabled = ["通义千问 / 百炼(qwen)"]` |
| 同一环境重复加载 3 次 | 仍 11 条、仍恰好 1 个启用项 | ✅ 幂等 |
| 注入 22 条全 `disabled` 脏数据后重载 | 自愈收敛到 11 条 + 补齐启用项 | ✅ 收敛到 11 条，自动启用 qwen |
| 零手动配置直接生成 | Provider 为 qwen、无错误、端点全 200 | ✅ `通义千问 / 百炼 · qwen-max`，无 `GENERATION_ERROR`，三端点 200 |
| 生成 → 进入课堂 → 播放 | 幻灯片与讲解正常 | ✅ |
| 刷新后课程仍在 | Dexie 持久化生效 | ✅ |

---

## 5. 仍未验证（诚实标注）

| 项 | 状态 | 说明 |
|---|---|---|
| 课堂语音实际发声（TTS 音频输出） | ⚠️ UNVERIFIED | 无头浏览器无音频输出设备；仅验证了讲解文本与播放控制渲染 |
| Browser Key（用户自填 Key 走 IndexedDB）浏览器流程 | ⚠️ UNVERIFIED | 实测走的是服务端环境变量回落路径；未在浏览器内填写 Key 实测 |
| 第二家**真实不同厂商**凭据 | ⚠️ UNVERIFIED | 本机仅有 DashScope 一张凭据，其余 10 家预设未逐一实测 |
| 性能预算（首页 TTI / 切场景延迟 / 大纲 P50） | ⚠️ UNVERIFIED | 未做性能采样；仅记录了一次端到端 2 场景约 275s 的墙钟时间 |
| 真实视频 Provider 链路 | ⚠️ UNVERIFIED | 未配置视频 Provider |

---

## 6. 复现方式

```bash
# 1) 启动
pnpm dev                     # http://localhost:3000（务必用 localhost）

# 2) 门禁
pnpm run typecheck && pnpm run lint && pnpm test
```

浏览器自动化复现（可选，需 `playwright-core` 与系统 Chrome）：

```bash
NODE_PATH="$WS/node_modules" node aiclassroom_fix_verify.mjs ./shots   # 6 个断言用例
NODE_PATH="$WS/node_modules" node aiclassroom_classroom.mjs ./shots    # 生成 → 课堂播放全链路
```

---

## 7. 结论

- 此前标记为 `UNVERIFIED` 的「浏览器内 Dexie 持久化 / 生成 → 进入课堂 → 播放 / 第二家 Provider 切换」
  中，**除 TTS 实际发声与第二家真实凭据外，均已在真实浏览器中跑通**。
- 实测暴露并修复了 **1 个严重缺陷 + 1 个中等缺陷**，二者均会导致「当前使用的 Provider 不确定」，
  表现为生成随机失败。修复后全新环境开箱即可用，历史脏数据会自动收敛。
- 新增 9 个回归用例，其中针对严重缺陷的用例已通过「还原旧逻辑 → 测试失败」证伪验证。
