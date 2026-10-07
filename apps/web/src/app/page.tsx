// @spec docs/PLAN.md (Phase 1A)
// 产品入口：输入教学主题 → 确认角色 → 开始生成。
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Textarea } from "@aiclassroom/ui";
import type { Language, Role } from "@aiclassroom/types";
import { saveLesson } from "@aiclassroom/db";
import { createLessonSkeleton } from "@/lib/gen/controller";
import { defaultRoles } from "@/lib/gen/roles";
import { useSettings } from "@/lib/settings";
import { useUserProviders, activeProvider } from "@/lib/userProviders";
import { RoleChip } from "@/components/RoleChip";
import { Nav } from "@/components/Nav";

const EXAMPLES = [
  "人工智能是什么？",
  "光合作用是怎么进行的？",
  "为什么天空是蓝色的？",
  "二战的起因有哪些？",
];

export default function HomePage() {
  const router = useRouter();
  const settings = useSettings();
  const { providers, load } = useUserProviders();
  const [topic, setTopic] = React.useState("");
  const [language, setLanguage] = React.useState<Language>(settings.language);
  const [roles, setRoles] = React.useState<Role[]>(() => defaultRoles());
  const [sceneCount, setSceneCount] = React.useState(2);
  const [browserVoices, setBrowserVoices] = React.useState<
    { id: string; name: string; lang: string }[]
    >([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void load();
  }, [load]);

  const active = activeProvider(providers);
  const noUsableKey = !active || !active.apiKey;

  const start = async () => {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    const lesson = createLessonSkeleton(t, language, roles, sceneCount);
    await saveLesson(lesson);
    router.push(`/studio/${lesson.id}`);
  };

  const editRole = (id: string, patch: Partial<Role>) =>
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const loadVoices = () => {
      const voices = synth
        .getVoices()
        .filter((v) => v.lang?.toLowerCase().startsWith("zh") || v.lang?.toLowerCase().startsWith("en"))
        .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
        .slice(0, 40);
      setBrowserVoices(voices);
    };
    loadVoices();
    const onChange = () => loadVoices();
    synth.addEventListener("voiceschanged", onChange);
    return () => synth.removeEventListener("voiceschanged", onChange);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">AI 多智能体互动课堂</h1>
        <p className="mt-2 text-slate-600">
          输入一个教学主题，由真实多智能体流水线（Outline → Scene → Action）生成课程，
          并进入沉浸式互动课堂。
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="text-sm font-medium text-slate-700">教学主题</label>
          <Textarea
            className="mt-2 min-h-[96px]"
            placeholder="例如：人工智能是什么？"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTopic(ex)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">语种</span>
            <div className="flex gap-1">
              {(["zh-CN", "en-US"] as Language[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLanguage(l);
                    settings.setLanguage(l);
                  }}
                  className={
                    "rounded-md px-3 py-1 text-sm " +
                    (language === l
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600")
                  }
                >
                  {l === "zh-CN" ? "中文" : "English"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">场景数</span>
            <Input
              className="max-w-[80px]"
              type="number"
              min={1}
              max={6}
              value={sceneCount}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setSceneCount(Number.isFinite(raw) ? Math.min(6, Math.max(1, raw)) : 2);
              }}
            />
            <span className="text-xs text-slate-400">支持 1-6，越少越快（默认 2）</span>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">课堂角色</span>
              <span className="text-xs text-slate-400">可编辑姓名与人设</span>
            </div>
            <div className="space-y-3">
              {roles.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-3">
                    <RoleChip role={r} />
                    <Input
                      className="max-w-[180px]"
                      value={r.name}
                      onChange={(e) => editRole(r.id, { name: e.target.value })}
                    />
                  </div>
                  <Input
                    className="mt-2"
                    value={r.personality}
                    onChange={(e) => editRole(r.id, { personality: e.target.value })}
                    placeholder="人设"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>音色</span>
                    <select
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                      value={r.voice.voiceURI ?? ""}
                      onChange={(e) =>
                        editRole(r.id, {
                          voice: {
                            ...r.voice,
                            voiceURI: e.target.value || undefined,
                          },
                        })
                      }
                    >
                      <option value="">自动匹配语言</option>
                      {browserVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.lang}
                        </option>
                      ))}
                    </select>
                    <span>语速</span>
                    <Input
                      className="max-w-[72px]"
                      type="number"
                      step={0.1}
                      min={0.5}
                      max={2}
                      value={r.voice.rate ?? 1}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        editRole(r.id, {
                          voice: {
                            ...r.voice,
                            rate: Number.isFinite(raw) ? Math.min(2, Math.max(0.5, raw)) : 1,
                          },
                        });
                      }}
                    />
                    <span>音调</span>
                    <Input
                      className="max-w-[72px]"
                      type="number"
                      step={0.1}
                      min={0}
                      max={2}
                      value={r.voice.pitch ?? 1}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        editRole(r.id, {
                          voice: {
                            ...r.voice,
                            pitch: Number.isFinite(raw) ? Math.min(2, Math.max(0, raw)) : 1,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {noUsableKey ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              当前 Provider 未配置 API Key。若服务端也未设置环境变量，生成将失败。
              可前往 <Link href="/settings" className="underline">设置</Link> 添加并设为当前使用。
            </p>
          ) : null}

          <Button
            variant="outline"
            className="mt-6 w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
            disabled={!topic.trim() || busy}
            onClick={start}
          >
            {busy ? "准备中…" : "开始生成课程 →"}
          </Button>
        </section>
      </main>
    </div>
  );
}
