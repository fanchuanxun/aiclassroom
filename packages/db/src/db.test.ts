// @spec docs/TESTING.md (Persistence Tests)
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { Lesson } from "@aiclassroom/types";
import { createId } from "@aiclassroom/types";
import { db } from "./db";
import {
  saveLesson,
  getLesson,
  listLessons,
  deleteLesson,
  exportLesson,
  importLesson,
} from "./repository";

function makeLesson(): Lesson {
  const teacherId = "role-teacher";
  const studentId = "role-student";
  const slideId = "slide-1";
  return {
    id: createId(),
    title: "人工智能是什么",
    description: "面向中学生的入门课",
    topic: "人工智能是什么？",
    language: "zh-CN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "ready",
    roles: [
      {
        id: teacherId,
        name: "林老师",
        kind: "teacher",
        avatarUrl: "🧑‍🏫",
        personality: "耐心严谨",
        bio: "十年教龄的 AI 科普老师",
        voice: { provider: "web-speech", lang: "zh-CN" },
        promptPersona: "你是一位严谨的中学老师",
        color: "#2563eb",
      },
      {
        id: studentId,
        name: "小明",
        kind: "student",
        avatarUrl: "🧑‍🎓",
        personality: "好奇好问",
        bio: "喜欢追问为什么的学生",
        voice: { provider: "web-speech", lang: "zh-CN" },
        promptPersona: "你是一个爱提问的中学生",
        color: "#16a34a",
      },
    ],
    scenes: [
      {
        id: "scene-1",
        index: 0,
        title: "开场",
        summary: "引出人工智能",
        learningGoals: ["理解 AI 的定义"],
        slide: {
          id: slideId,
          layout: "content",
          title: "人工智能是什么",
          elements: [
            { kind: "text", id: "el-1-1", text: "AI 的定义", region: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 } },
          ],
        },
        actions: [
          { id: "s1-SLIDE", type: "SLIDE", op: "show", slideId, blocking: true },
          {
            id: "s1-SPEECH",
            type: "SPEECH",
            roleId: teacherId,
            text: "同学们好，今天我们来聊聊人工智能。",
            showSubtitle: true,
            blocking: true,
          },
        ],
        status: "ready",
      },
    ],
    meta: { difficulty: "beginner", estimatedDurationMin: 10 },
  };
}

beforeEach(async () => {
  await db.lessons.clear();
});

describe("db/repository", () => {
  it("save + get 往返一致", async () => {
    const lesson = makeLesson();
    await saveLesson(lesson);
    const got = await getLesson(lesson.id);
    expect(got).toEqual(lesson);
  });

  it("listLessons 返回摘要并按时间倒序", async () => {
    const a = makeLesson();
    const b = makeLesson();
    await saveLesson(a);
    await new Promise((r) => setTimeout(r, 5));
    await saveLesson(b);
    const list = await listLessons();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(b.id);
    expect(list[0]?.sceneCount).toBe(1);
    expect(list[0]?.status).toBe("ready");
  });

  it("deleteLesson 后读不到", async () => {
    const lesson = makeLesson();
    await saveLesson(lesson);
    await deleteLesson(lesson.id);
    expect(await getLesson(lesson.id)).toBeUndefined();
  });

  it("export 再 import 保持数据不变", async () => {
    const lesson = makeLesson();
    await saveLesson(lesson);
    const json = await exportLesson(lesson.id);
    const reimported = await importLesson(json);
    expect(reimported).toEqual(lesson);
  });

  it("import 非法数据必须 reject，不静默入库", async () => {
    const bad = makeLesson();
    // 破坏 scene index（应等于数组下标），触发运行时不变量校验
    bad.scenes[0]!.index = 99;
    const json = JSON.stringify(bad);
    await expect(importLesson(json)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await listLessons()).toHaveLength(0);
  });
});
