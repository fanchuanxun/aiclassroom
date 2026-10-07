// @spec docs/PLAN.md (Phase 3)
// 课程库：历史列表、打开（继续生成 / 回放）、删除、导出、导入。
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@aiclassroom/ui";
import { toast } from "@aiclassroom/ui";
import { useLessons } from "@/lib/useLesson";
import { deleteLesson, exportLesson, importLesson } from "@aiclassroom/db";
import { Nav } from "@/components/Nav";

export default function LibraryPage() {
  const lessons = useLessons();
  const [importing, setImporting] = React.useState(false);

  const openHref = (status: string, id: string) =>
    status === "ready" ? `/classroom/${id}` : `/studio/${id}`;

  const onDelete = async (id: string, title: string) => {
    if (!window.confirm(`确定删除《${title}》？此操作不可恢复。`)) return;
    await deleteLesson(id);
    toast({ title: "已删除", variant: "success" });
  };

  const onExport = async (id: string, title: string) => {
    try {
      const json = await exportLesson(id);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "导出失败", description: String(e), variant: "error" });
    }
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const lesson = await importLesson(text);
      toast({ title: "导入成功", description: lesson.title, variant: "success" });
    } catch (e) {
      toast({
        title: "导入失败",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">课程库</h1>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
              {importing ? "导入中…" : "导入 JSON"}
            </span>
          </label>
        </div>

        {lessons.length === 0 ? (
          <div className="mt-10 text-center text-sm text-slate-400">
            还没有课程。去 <Link href="/" className="underline">主页</Link> 生成第一节课吧。
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {lessons.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{l.title}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {l.topic} · {l.scenes.length} 个场景 · {l.status}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={openHref(l.status, l.id)}>
                    <Button variant="outline" size="sm">
                      {l.status === "ready" ? "打开/回放" : "继续"}
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => onExport(l.id, l.title)}>
                    导出
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDelete(l.id, l.title)}>
                    删除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
