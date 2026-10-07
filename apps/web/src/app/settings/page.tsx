// @spec docs/PLAN.md (Phase 1 用户自定义 Provider)
// 模型设置：用户无需改代码 / 无需改 .env.local，仅在此页即可
// 新增 / 编辑 / 删除 / 设为当前 / 测试连接 任意 Provider（内置或自定义 OpenAI Compatible）。
"use client";

import * as React from "react";
import { Button, Input } from "@aiclassroom/ui";
import { Nav } from "@/components/Nav";
import {
  useUserProviders,
  activeProvider,
  maskApiKey,
  newCustomProvider,
} from "@/lib/userProviders";
import {
  useImageProviders,
  newImageProvider,
} from "@/lib/imageProviders";
import {
  useVideoProviders,
  newVideoProvider,
} from "@/lib/videoProviders";
import type { VideoProviderConfig } from "@aiclassroom/types";
import {
  CUSTOM_PROVIDER_ID,
  validateUserProviderConfig,
  type ProviderValidationIssue,
} from "@aiclassroom/llm/presets";
import type { ImageProviderConfig } from "@aiclassroom/types";
import type { UserProviderConfig } from "@aiclassroom/llm";
// import { createId } from "@aiclassroom/types";

interface FormState {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const EMPTY_FORM: FormState = { name: "", apiKey: "", baseUrl: "", model: "" };

function issueKey(i: ProviderValidationIssue): string {
  return `${i.field}:${i.level}`;
}

export default function SettingsPage() {
  const { providers, loaded, load, add, update, remove, setActive } =
    useUserProviders();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [addingCustom, setAddingCustom] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<
    string,
    { ok: boolean; message: string; latencyMs?: number; details?: string }
  >>({});

  const {
    providers: imageProviders,
    load: loadImage,
    add: addImage,
    update: updateImage,
    remove: removeImage,
    setActive: setActiveImage,
  } = useImageProviders();
  const [editingImageId, setEditingImageId] = React.useState<string | null>(null);
  const [addingImage, setAddingImage] = React.useState(false);
  const [imageForm, setImageForm] = React.useState({ name: "", apiKey: "", baseUrl: "", model: "" });
  const [, setImageSaved] = React.useState(false);
  const [, setImageError] = React.useState<string | null>(null);
  const [testingImageId, setTestingImageId] = React.useState<string | null>(null);
  const [imageTestResults, setImageTestResults] = React.useState<Record<
    string,
    { ok: boolean; message: string; latencyMs?: number; details?: string }
  >>({});
  const [imageModels, setImageModels] = React.useState<string[]>([]);
  const [fetchingImageModels, setFetchingImageModels] = React.useState(false);
  const [imageModelError, setImageModelError] = React.useState<string | null>(null);

  const {
    providers: videoProviders,
    load: loadVideo,
    add: addVideo,
    update: updateVideo,
    remove: removeVideo,
    setActive: setActiveVideo,
  } = useVideoProviders();
  const [editingVideoId, setEditingVideoId] = React.useState<string | null>(null);
  const [addingVideo, setAddingVideo] = React.useState(false);
  const [videoForm, setVideoForm] = React.useState({ name: "", apiKey: "", baseUrl: "", model: "" });
  const [, setVideoSaved] = React.useState(false);
  const [, setVideoError] = React.useState<string | null>(null);
  const [testingVideoId, setTestingVideoId] = React.useState<string | null>(null);
  const [videoTestResults, setVideoTestResults] = React.useState<Record<
    string,
    { ok: boolean; message: string; latencyMs?: number; details?: string }
  >>({});
  const [videoModels, setVideoModels] = React.useState<string[]>([]);
  const [fetchingVideoModels, setFetchingVideoModels] = React.useState(false);
  const [videoModelError, setVideoModelError] = React.useState<string | null>(null);
  const [videoEnabled, setVideoEnabled] = React.useState(false);

  React.useEffect(() => {
    void load();
    void loadImage();
    void loadVideo();
  }, [load, loadImage, loadVideo]);

  const active = activeProvider(providers);
  const current = editingId
    ? providers.find((p) => p.id === editingId)
    : undefined;

  const issues = validateUserProviderConfig(form, { requireBaseUrl: !editingId });
  const hasError = issues.some((i) => i.level === "error");

  const startEdit = (p: UserProviderConfig) => {
    setEditingId(p.id);
    setAddingCustom(false);
    setForm({ name: p.name, apiKey: p.apiKey, baseUrl: p.baseUrl ?? "", model: p.model });
    setSaved(false);
    setError(null);
  };

  const startAddCustom = () => {
    setEditingId(null);
    setAddingCustom(true);
    setForm(EMPTY_FORM);
    setSaved(false);
    setError(null);
  };

  const startAddImage = () => {
    setEditingImageId(null);
    setAddingImage(true);
    setImageForm({ name: "", apiKey: "", baseUrl: "", model: "" });
    setImageSaved(false);
    setImageError(null);
  };

  const startAddVideo = () => {
    setEditingVideoId(null);
    setAddingVideo(true);
    setVideoForm({ name: "", apiKey: "", baseUrl: "", model: "" });
    setVideoSaved(false);
    setVideoError(null);
  };

  const startEditVideo = (p: VideoProviderConfig) => {
    setEditingVideoId(p.id);
    setVideoForm({ name: p.name, apiKey: p.apiKey, baseUrl: p.baseUrl ?? "", model: p.model });
    setVideoEnabled(p.enabled);
    setVideoSaved(false);
    setVideoError(null);
  };

  const startEditImage = (p: ImageProviderConfig) => {
    setEditingImageId(p.id);
    setImageForm({ name: p.name, apiKey: p.apiKey, baseUrl: p.baseUrl ?? "", model: p.model });
    setImageSaved(false);
    setImageError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setAddingCustom(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const cancelImage = () => {
    setEditingImageId(null);
    setAddingImage(false);
    setImageForm({ name: "", apiKey: "", baseUrl: "", model: "" });
    setImageError(null);
  };

  const cancelVideo = () => {
    setEditingVideoId(null);
    setAddingVideo(false);
    setVideoForm({ name: "", apiKey: "", baseUrl: "", model: "" });
    setVideoError(null);
  };

  const save = async () => {
    if (hasError) return;
    setError(null);
    const f = {
      name: form.name.trim(),
      apiKey: form.apiKey,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
    };
    const now = new Date().toISOString();
    try {
      if (editingId && current) {
        await update({
          ...current,
          name: f.name || current.name,
          apiKey: f.apiKey,
          baseUrl: f.baseUrl || undefined,
          model: f.model,
          updatedAt: now,
        });
      } else {
        await add(newCustomProvider(f.name, f.apiKey, f.baseUrl, f.model));
      }
      setSaved(true);
      cancel();
    } catch (e) {
      setError(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveImage = async () => {
    setImageError(null);
    const f = {
      name: imageForm.name.trim(),
      apiKey: imageForm.apiKey,
      baseUrl: imageForm.baseUrl.trim(),
      model: imageForm.model.trim(),
    };
    if (!f.name || !f.model) {
      setImageError("名称和图片模型不能为空");
      return;
    }
    const now = new Date().toISOString();
    try {
      if (editingImageId) {
        const current = imageProviders.find((p) => p.id === editingImageId);
        if (!current) return;
        await updateImage({
          ...current,
          name: f.name || current.name,
          apiKey: f.apiKey,
          ...(f.baseUrl ? { baseUrl: f.baseUrl } : {}),
          model: f.model,
          updatedAt: now,
        });
      } else {
        await addImage(newImageProvider(f.name, f.apiKey, f.baseUrl, f.model));
      }
      setImageSaved(true);
      cancelImage();
    } catch (e) {
      setImageError(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveVideo = async () => {
    setVideoError(null);
    const f = {
      name: videoForm.name.trim(),
      apiKey: videoForm.apiKey,
      baseUrl: videoForm.baseUrl.trim(),
      model: videoForm.model.trim(),
    };
    if (!f.name || !f.model) {
      setVideoError("名称和视频模型不能为空");
      return;
    }
    const now = new Date().toISOString();
    try {
      if (editingVideoId) {
        const current = videoProviders.find((p) => p.id === editingVideoId);
        if (!current) return;
        await updateVideo({
          ...current,
          name: f.name || current.name,
          apiKey: f.apiKey,
          ...(f.baseUrl ? { baseUrl: f.baseUrl } : {}),
          enabled: videoEnabled,
          model: f.model,
          updatedAt: now,
        });
      } else {
        await addVideo(newVideoProvider(f.name, f.apiKey, f.baseUrl, f.model));
      }
      setVideoSaved(true);
      cancelVideo();
    } catch (e) {
      setVideoError(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const testProvider = async (p: UserProviderConfig) => {
    setTestingId(p.id);
    setTestResults((r) => ({ ...r, [p.id]: { ok: false, message: "测试中…" } }));
    try {
      const res = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: p.providerId,
          name: p.name,
          apiKey: p.apiKey,
          baseUrl: p.baseUrl,
          model: p.model,
        }),
      });
      const data = await res.json();
      setTestResults((r) => ({
        ...r,
        [p.id]: {
          ok: Boolean(data.ok),
          message: data.ok
            ? `连接成功（${data.latencyMs ?? "?"}ms）`
            : data.message ?? "连接失败",
          latencyMs: data.latencyMs,
          details: typeof data.details === "string" ? data.details : undefined,
        },
      }));
    } catch (e) {
      setTestResults((r) => ({
        ...r,
        [p.id]: { ok: false, message: `请求异常：${String(e)}` },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const testImageProvider = async (p: ImageProviderConfig) => {
    setTestingImageId(p.id);
    setImageTestResults((r) => ({ ...r, [p.id]: { ok: false, message: "测试中…" } }));
    try {
      const res = await fetch("/api/image-provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          apiKey: p.apiKey,
          baseUrl: p.baseUrl,
          model: p.model,
        }),
      });
      const data = await res.json();
      setImageTestResults((r) => ({
        ...r,
        [p.id]: {
          ok: Boolean(data.ok),
          message: data.ok
            ? `连接成功（${data.latencyMs ?? "?"}ms）`
            : data.message ?? "连接失败",
          latencyMs: data.latencyMs,
          details: typeof data.details === "string" ? data.details : undefined,
        },
      }));
    } catch (e) {
      setImageTestResults((r) => ({
        ...r,
        [p.id]: { ok: false, message: `请求异常：${String(e)}` },
      }));
    } finally {
      setTestingImageId(null);
    }
  };

  const testVideoProvider = async (p: VideoProviderConfig) => {
    setTestingVideoId(p.id);
    setVideoTestResults((r) => ({ ...r, [p.id]: { ok: false, message: "测试中…" } }));
    try {
      const res = await fetch("/api/video-provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          apiKey: p.apiKey,
          baseUrl: p.baseUrl,
          model: p.model,
        }),
      });
      const data = await res.json();
      setVideoTestResults((r) => ({
        ...r,
        [p.id]: {
          ok: Boolean(data.ok),
          message: data.ok
            ? `连接成功（${data.latencyMs ?? "?"}ms）`
            : data.message ?? "连接失败",
          latencyMs: data.latencyMs,
          details: typeof data.details === "string" ? data.details : undefined,
        },
      }));
    } catch (e) {
      setVideoTestResults((r) => ({
        ...r,
        [p.id]: { ok: false, message: `请求异常：${String(e)}` },
      }));
    } finally {
      setTestingVideoId(null);
    }
  };

  const fetchImageModels = async () => {
    if (!imageForm.baseUrl || imageForm.baseUrl.trim() === "") {
      setImageModelError("请先填写 Base URL");
      return;
    }
    setFetchingImageModels(true);
    setImageModelError(null);
    setImageModels([]);
    try {
      const res = await fetch("/api/image-provider/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: imageForm.apiKey, baseUrl: imageForm.baseUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setImageModels(data.models ?? []);
        if ((data.models ?? []).length === 0) {
          setImageModelError("该端点未返回可用模型");
        }
      } else {
        setImageModelError(data.message ?? "拉取模型失败");
      }
    } catch (e) {
      setImageModelError(`请求异常：${String(e)}`);
    } finally {
      setFetchingImageModels(false);
    }
  };

  const fetchVideoModels = async () => {
    if (!videoForm.baseUrl || videoForm.baseUrl.trim() === "") {
      setVideoModelError("请先填写 Base URL");
      return;
    }
    setFetchingVideoModels(true);
    setVideoModelError(null);
    setVideoModels([]);
    try {
      const res = await fetch("/api/video-provider/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: videoForm.apiKey, baseUrl: videoForm.baseUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setVideoModels(data.models ?? []);
        if ((data.models ?? []).length === 0) {
          setVideoModelError("该端点未返回可用模型");
        }
      } else {
        setVideoModelError(data.message ?? "拉取模型失败");
      }
    } catch (e) {
      setVideoModelError(`请求异常：${String(e)}`);
    } finally {
      setFetchingVideoModels(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-10 text-sm text-slate-400">
          加载中…
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">AI 模型设置</h1>
        <p className="mt-1 text-sm text-slate-500">
          在此配置你自己的 API。所有凭据仅保存在本机浏览器（IndexedDB），不会上传到服务端或进入任何日志。
        </p>

        {/* 当前 Provider */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">当前 Provider</h2>
          {active ? (
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{active.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {active.model}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                API Key：{maskApiKey(active.apiKey)}
              </div>
              <div className="text-xs text-slate-400">
                {active.apiKey
                  ? "使用你配置的 API Key"
                  : "未配置 Key，将回落到服务端环境变量（若已配置）"}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">尚未配置任何 Provider。</p>
          )}
        </section>

        {/* Provider 列表 */}
        <section className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">已配置的 Provider</h2>
            <Button variant="outline" onClick={startAddCustom}>
              + 自定义 OpenAI Compatible
            </Button>
          </div>

          {providers.length === 0 ? (
            <p className="text-sm text-slate-400">暂无，点击下方内置 Provider 添加。</p>
          ) : (
            providers.map((p) => {
              const isEditing = editingId === p.id;
              const isActive = p.enabled;
              const test = testResults[p.id];
              const isCustom = p.providerId === CUSTOM_PROVIDER_ID;
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {isEditing ? (
                    <EditForm
                      form={form}
                      setForm={setForm}
                      issues={issues}
                      hasError={hasError}
                      onSave={save}
                      onCancel={cancel}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{p.name}</span>
                            {isActive ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                                当前使用
                              </span>
                            ) : null}
                            {isCustom ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                                自定义
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {p.providerId} · {p.model}
                          </div>
                          <div className="text-xs text-slate-400">
                            API Key：{maskApiKey(p.apiKey)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {p.apiKey
                              ? "使用你配置的 API Key"
                              : "未配置 Key，将回落到服务端环境变量（若已配置）"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void testProvider(p)}
                            disabled={testingId === p.id}
                          >
                            {testingId === p.id ? "测试中…" : "测试连接"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void setActive(p.id)}
                            disabled={isActive}
                          >
                            设为当前
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600"
                            onClick={() => void remove(p.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                      {test ? (
                        <p className={`mt-2 text-xs ${test.ok ? "text-emerald-700" : "text-rose-700"}`}>
                          {test.ok ? `✓ ${test.message}` : `✕ ${test.message}`}
                          {test.details ? (
                            <span className="ml-2 text-slate-400">{test.details}</span>
                          ) : null}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          )}
        </section>

        {addingCustom ? (
          <section className="mt-4 rounded-2xl border border-slate-900 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">
              新增自定义 OpenAI Compatible
            </h3>
            <div className="mt-3">
              <EditForm
                form={form}
                setForm={setForm}
                issues={issues}
                hasError={hasError}
                onSave={save}
                onCancel={cancel}
              />
            </div>
          </section>
        ) : null}

        {editingImageId || addingImage ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">编辑图片 API</h2>
          <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">名称</label>
                <Input
                  className="mt-1"
                  value={imageForm.name}
                  onChange={(e) => setImageForm({ ...imageForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">API Key</label>
                <Input
                  className="mt-1"
                  type="password"
                  autoComplete="off"
                  value={imageForm.apiKey}
                  onChange={(e) => setImageForm({ ...imageForm, apiKey: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Base URL</label>
                <Input
                  className="mt-1"
                  value={imageForm.baseUrl}
                  onChange={(e) => setImageForm({ ...imageForm, baseUrl: e.target.value })}
                  placeholder="留空则使用默认 OpenAI Images 地址"
                />
                <p className="mt-1 text-xs text-slate-400">
                  通常为 OpenAI-compatible 的 images 端点，例如 https://api.example.com/v1。
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">图片模型</label>
                <div className="mt-1 flex gap-2">
                  <Input
                    className="flex-1"
                    value={imageForm.model}
                    onChange={(e) => setImageForm({ ...imageForm, model: e.target.value })}
                    placeholder="例如 dall-e-3 / gpt-image-1 / 自定义图片模型"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    disabled={fetchingImageModels || !imageForm.baseUrl.trim()}
                    onClick={() => void fetchImageModels()}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {fetchingImageModels ? "拉取中…" : "拉取模型"}
                  </Button>
                </div>
                {imageModels.length > 0 ? (
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    value={imageForm.model}
                    onChange={(e) => setImageForm({ ...imageForm, model: e.target.value })}
                  >
                    <option value="">— 选择模型 —</option>
                    {imageModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="mt-2"
                    value={imageForm.model}
                    onChange={(e) => setImageForm({ ...imageForm, model: e.target.value })}
                    placeholder="例如 dall-e-3 / gpt-image-1 / 自定义图片模型"
                  />
                )}
                {imageModelError ? (
                  <p className="mt-1 text-xs text-rose-600">⚠ {imageModelError}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    也可点击「拉取模型」自动列出该 API 支持的模型。
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveImage}>保存</Button>
                <Button variant="outline" onClick={cancelImage}>取消</Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">图片 API</h2>
                <p className="mt-1 text-xs text-slate-400">
                  用于后续生成课程配图；凭据仅保存在本机 IndexedDB，不进入 Lesson / 日志。
                </p>
              </div>
              <Button variant="outline" onClick={startAddImage}>
                + 添加图片 API
              </Button>
            </div>

            {imageProviders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">尚未配置图片 API。</p>
            ) : (
              <div className="mt-3 space-y-3">
                {imageProviders.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          {p.enabled ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                              当前使用
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {p.adapter} · {p.model}
                        </div>
                        <div className="text-xs text-slate-400">
                          API Key：{maskApiKey(p.apiKey)}
                        </div>
                        {p.baseUrl ? (
                          <div className="text-xs text-slate-400">{p.baseUrl}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testImageProvider(p)}
                          disabled={testingImageId === p.id}
                        >
                          {testingImageId === p.id ? "测试中…" : "测试连接"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditImage(p)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveImage(p.id)}
                          disabled={p.enabled}
                        >
                          设为当前
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600"
                          onClick={() => removeImage(p.id)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    {imageTestResults[p.id] ? (
                      <p
                        className={`mt-2 text-xs ${
                          imageTestResults[p.id]!.ok ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {imageTestResults[p.id]!.ok
                          ? `✓ ${imageTestResults[p.id]!.message}`
                          : `✕ ${imageTestResults[p.id]!.message}`}
                        {imageTestResults[p.id]!.details ? (
                          <span className="ml-2 text-slate-400">
                            {imageTestResults[p.id]!.details}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
              ))}
            </div>
          )}
        </section>
        )}

        {editingVideoId || addingVideo ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">编辑视频 API</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">名称</label>
                <Input
                  className="mt-1"
                  value={videoForm.name}
                  onChange={(e) => setVideoForm({ ...videoForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">API Key</label>
                <Input
                  className="mt-1"
                  type="password"
                  autoComplete="off"
                  value={videoForm.apiKey}
                  onChange={(e) => setVideoForm({ ...videoForm, apiKey: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Base URL</label>
                <Input
                  className="mt-1"
                  value={videoForm.baseUrl}
                  onChange={(e) => setVideoForm({ ...videoForm, baseUrl: e.target.value })}
                  placeholder="留空则使用默认 OpenAI-compatible 地址"
                />
                <p className="mt-1 text-xs text-slate-400">
                  通常为兼容视频生成的 /v1 地址，例如 https://api.example.com/v1。
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">视频模型</label>
                <div className="mt-1 flex gap-2">
                  <Input
                    className="flex-1"
                    value={videoForm.model}
                    onChange={(e) => setVideoForm({ ...videoForm, model: e.target.value })}
                    placeholder="例如可灵 / 自定义视频生成模型"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    disabled={fetchingVideoModels || !videoForm.baseUrl.trim()}
                    onClick={() => void fetchVideoModels()}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {fetchingVideoModels ? "拉取中…" : "拉取模型"}
                  </Button>
                </div>
                {videoModels.length > 0 ? (
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    value={videoForm.model}
                    onChange={(e) => setVideoForm({ ...videoForm, model: e.target.value })}
                  >
                    <option value="">— 选择模型 —</option>
                    {videoModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="mt-2"
                    value={videoForm.model}
                    onChange={(e) => setVideoForm({ ...videoForm, model: e.target.value })}
                    placeholder="例如可灵 / 自定义视频生成模型"
                  />
                )}
                {videoModelError ? (
                  <p className="mt-1 text-xs text-rose-600">⚠ {videoModelError}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    也可点击「拉取模型」自动列出该 API 支持的模型。
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="video-enabled"
                  type="checkbox"
                  checked={videoEnabled}
                  onChange={(e) => setVideoEnabled(e.target.checked)}
                />
                <label htmlFor="video-enabled" className="text-xs text-slate-700">
                  启用该视频 API
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveVideo}>保存</Button>
                <Button variant="outline" onClick={cancelVideo}>取消</Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">视频 API</h2>
                <p className="mt-1 text-xs text-slate-400">
                  用于后续生成课程视频素材；凭据仅保存在本机 IndexedDB，不进入 Lesson / 日志。
                </p>
              </div>
              <Button variant="outline" onClick={startAddVideo}>
                + 添加视频 API
              </Button>
            </div>

            {videoProviders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">尚未配置视频 API。</p>
            ) : (
              <div className="mt-3 space-y-3">
                {videoProviders.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          {p.enabled ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                              当前使用
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {p.adapter} · {p.model}
                        </div>
                        <div className="text-xs text-slate-400">
                          API Key：{maskApiKey(p.apiKey)}
                        </div>
                        {p.baseUrl ? (
                          <div className="text-xs text-slate-400">{p.baseUrl}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testVideoProvider(p)}
                          disabled={testingVideoId === p.id}
                        >
                          {testingVideoId === p.id ? "测试中…" : "测试连接"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditVideo(p)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveVideo(p.id)}
                          disabled={p.enabled}
                        >
                          设为当前
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600"
                          onClick={() => removeVideo(p.id)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    {videoTestResults[p.id] ? (
                      <p
                        className={`mt-2 text-xs ${
                          videoTestResults[p.id]!.ok ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {videoTestResults[p.id]!.ok
                          ? `✓ ${videoTestResults[p.id]!.message}`
                          : `✕ ${videoTestResults[p.id]!.message}`}
                        {videoTestResults[p.id]!.details ? (
                          <span className="ml-2 text-slate-400">
                            {videoTestResults[p.id]!.details}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {error ? (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
            ✕ {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mt-4 text-xs text-emerald-600">
            已保存到本机（浏览器 IndexedDB）。刷新页面后配置仍在。
          </p>
        ) : null}

        <div className="mt-4">
          <Button variant="outline" onClick={() => window.history.back()}>
            返回
          </Button>
        </div>
      </main>
    </div>
  );
}

function EditForm({
  form,
  setForm,
  issues,
  hasError,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  issues: ProviderValidationIssue[];
  hasError: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const [models, setModels] = React.useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = React.useState(false);
  const [modelError, setModelError] = React.useState<string | null>(null);

  const fetchModels = async () => {
    if (!form.baseUrl || form.baseUrl.trim() === "") {
      setModelError("请先填写 Base URL");
      return;
    }
    setFetchingModels(true);
    setModelError(null);
    setModels([]);
    try {
      const res = await fetch("/api/provider/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: form.apiKey, baseUrl: form.baseUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setModels(data.models ?? []);
        if ((data.models ?? []).length === 0) {
          setModelError("该端点未返回可用模型");
        }
      } else {
        setModelError(data.message ?? "拉取模型失败");
      }
    } catch (e) {
      setModelError(`请求异常：${String(e)}`);
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-700">名称</label>
        <Input
          className="mt-1"
          value={form.name}
          placeholder="例如：我的中转 API"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-700">API Key</label>
        <Input
          className="mt-1"
          type="password"
          autoComplete="off"
          value={form.apiKey}
          placeholder="sk-...（留空则使用服务端环境变量）"
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-700">Base URL</label>
        <Input
          className="mt-1"
          value={form.baseUrl}
          placeholder="https://example.com/v1"
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-400">
          需为 OpenAI-compatible 的 chat completions 端点，通常以 /v1 结尾。
        </p>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-700">Model</label>
        <div className="mt-1 flex gap-2">
          <Input
            className="flex-1"
            value={form.model}
            placeholder="例如 qwen-max / deepseek-chat / gpt-4o"
            onChange={(e) => set({ model: e.target.value })}
          />
          <Button
            variant="outline"
            type="button"
            disabled={fetchingModels || !form.baseUrl.trim()}
            onClick={() => void fetchModels()}
            className="shrink-0 whitespace-nowrap"
          >
            {fetchingModels ? "拉取中…" : "拉取模型"}
          </Button>
        </div>
        {models.length > 0 ? (
          <select
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            value={form.model}
            onChange={(e) => set({ model: e.target.value })}
          >
            <option value="">— 选择模型 —</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
        {modelError ? (
          <p className="mt-1 text-xs text-rose-600">⚠ {modelError}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">
            也可点击「拉取模型」自动列出该 API 支持的模型。
          </p>
        )}
      </div>

      {issues.length > 0 ? (
        <ul className="space-y-1">
          {issues.map((i) => (
            <li
              key={issueKey(i)}
              className={
                "text-xs " +
                (i.level === "error" ? "text-rose-600" : "text-amber-600")
              }
            >
              {i.level === "error" ? "✕ " : "⚠ "}
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={hasError}
          onClick={onSave}
          className="border-slate-300 disabled:border-slate-300 disabled:text-slate-500"
        >
          保存
        </Button>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
