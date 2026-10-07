// @spec docs/PLAN.md (Phase 3) / Phase 1C（场景动态注入）
// 客户端课程读取 hook：轮询 Dexie 以反映后台生成进度。
"use client";

import * as React from "react";
import { getLesson, listLessons } from "@aiclassroom/db";
import type { Lesson } from "@aiclassroom/types";

export function useLesson(lessonId: string, pollMs = 1200): Lesson | null {
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const l = await getLesson(lessonId);
      if (active) setLesson(l ?? null);
    };
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [lessonId, pollMs]);
  return lesson;
}

export function useLessons(): Lesson[] {
  const [list, setList] = React.useState<Lesson[]>([]);
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const summaries = await listLessons();
      const lessons = await Promise.all(
        summaries.map(async (s) => (await getLesson(s.id)) ?? null),
      );
      if (active) setList(lessons.filter((l): l is Lesson => l !== null));
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return list;
}
