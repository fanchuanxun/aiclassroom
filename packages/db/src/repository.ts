// @spec docs/DATA-MODEL.md §4 / docs/PLAN.md (Phase 3)
// 仓储层：Lesson 的创建、保存、读取、历史、删除、导入、导出。
// 非法导入数据一律 reject（validateLesson），禁止静默入库。

import { AppError } from "@aiclassroom/types";
import type {
  Language,
  Lesson,
  LessonStatus,
} from "@aiclassroom/types";
import { validateLesson } from "@aiclassroom/types";
import { db, recordToLesson, type LessonRecord } from "./db";

export interface LessonSummary {
  id: string;
  title: string;
  topic: string;
  language: Language;
  status: LessonStatus;
  sceneCount: number;
  updatedAt: string;
  lastOpenedAt?: string;
}

/** 写入或更新课程。updatedAt 由调用方负责（保留往返一致性），仅补充 lastOpenedAt 用于历史排序。 */
export async function saveLesson(lesson: Lesson): Promise<void> {
  const rec: LessonRecord = {
    ...lesson,
    lastOpenedAt: new Date().toISOString(),
  };
  await db.lessons.put(rec);
}

/** 读取完整课程；不存在返回 undefined。 */
export async function getLesson(id: string): Promise<Lesson | undefined> {
  const rec = await db.lessons.get(id);
  return rec === undefined ? undefined : recordToLesson(rec);
}

/** 历史列表（按最后打开时间倒序）。 */
export async function listLessons(): Promise<LessonSummary[]> {
  const all = await db.lessons.toArray();
  return all
    .map<LessonSummary>((rec) => ({
      id: rec.id,
      title: rec.title,
      topic: rec.topic,
      language: rec.language,
      status: rec.status,
      sceneCount: rec.scenes.length,
      updatedAt: rec.updatedAt,
      ...(rec.lastOpenedAt === undefined ? {} : { lastOpenedAt: rec.lastOpenedAt }),
    }))
    .sort((a, b) =>
      (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt),
    );
}

/** 删除课程。 */
export async function deleteLesson(id: string): Promise<void> {
  await db.lessons.delete(id);
}

/** 记录一次打开（用于历史排序）。 */
export async function markOpened(id: string): Promise<void> {
  await db.lessons.update(id, { lastOpenedAt: new Date().toISOString() });
}

/** 导出为 JSON 字符串（剥离存储元数据）。 */
export async function exportLesson(id: string): Promise<string> {
  const rec = await db.lessons.get(id);
  if (rec === undefined) {
    throw new AppError("PERSISTENCE_ERROR", `课程不存在，无法导出：${id}`, {
      retryable: false,
    });
  }
  const lesson = recordToLesson(rec);
  return JSON.stringify(lesson, null, 2);
}

/** 从 JSON 导入；先经 validateLesson 强校验，非法则 reject。 */
export async function importLesson(json: string): Promise<Lesson> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AppError("PERSISTENCE_ERROR", "导入失败：JSON 解析错误", {
      retryable: false,
    });
  }
  const result = validateLesson(parsed);
  if (!result.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `导入数据不合法：${result.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      { retryable: false },
    );
  }
  await saveLesson(result.data);
  return result.data;
}
