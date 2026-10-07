// @spec docs/TESTING.md
// 故意测试非法情况：系统必须「正确失败」，而不是「假装成功」。
import { describe, expect, it } from "vitest";
import type { Action, Lesson, Role, Scene } from "./index";
import { createId } from "./index";
import {
  assertValidLesson,
  checkLessonInvariants,
  validateAction,
  validateLesson,
} from "./index";
import { ValidationError } from "./index";
import { canTransition } from "./index";

const teacher: Role = {
  id: "teacher-li",
  name: "李老师",
  kind: "teacher",
  avatarUrl: "TEACHER",
  personality: "耐心细致，善于用比喻讲解复杂概念",
  bio: "拥有十年教学经验的 AI 讲师",
  voice: { provider: "web-speech", rate: 1 },
  promptPersona: "你是一位耐心细致的讲师。",
  color: "#4F46E5",
};

const student: Role = {
  id: "student-mei",
  name: "小美",
  kind: "student",
  avatarUrl: "STUDENT",
  personality: "认真好学，喜欢做笔记和总结",
  bio: "对新技术充满好奇的学生",
  voice: { provider: "web-speech", rate: 1 },
  promptPersona: "你是一位认真好学的学生。",
  color: "#EC4899",
};

function speech(overrides: Partial<Action> = {}): Action {
  return {
    id: "act-1",
    type: "SPEECH",
    roleId: "teacher-li",
    text: "同学们好，今天我们学习人工智能。",
    showSubtitle: true,
    blocking: true,
    ...overrides,
  } as Action;
}

function makeScene(index: number, overrides: Partial<Scene> = {}): Scene {
  return {
    id: `scene-${index + 1}`,
    index,
    title: `第 ${index + 1} 节`,
    summary: "摘要",
    learningGoals: ["目标一"],
    slide: {
      id: `slide-${index + 1}`,
      layout: "title",
      elements: [
        {
          kind: "text",
          id: `el-${index + 1}`,
          text: "内容",
          region: { x: 0, y: 0, w: 1, h: 1 },
        },
      ],
    },
    actions: [speech({ id: `act-${index + 1}` })],
    status: "ready",
    ...overrides,
  } satisfies Scene;
}

function makeLesson(scenes: Scene[] = [makeScene(0)]): Lesson {
  return {
    id: "lesson-1",
    title: "人工智能入门",
    description: "一门关于人工智能的入门课",
    topic: "人工智能是什么？",
    language: "zh-CN",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    status: "ready",
    roles: [teacher, student],
    scenes,
    meta: { difficulty: "beginner", estimatedDurationMin: 20 },
  } satisfies Lesson;
}

describe("types smoke", () => {
  it("createId 生成 12 位唯一 ID", () => {
    const a = createId();
    const b = createId();
    expect(a).toHaveLength(12);
    expect(a).not.toBe(b);
  });
});

describe("validateLesson — 合法数据", () => {
  it("最小合法 Lesson 通过校验", () => {
    const result = validateLesson(makeLesson());
    expect(result.ok).toBe(true);
  });

  it("空 scenes 列表是允许的（draft 状态）", () => {
    const lesson = { ...makeLesson([]), status: "draft" as const };
    expect(validateLesson(lesson).ok).toBe(true);
  });

  it("assertValidLesson 通过时返回数据", () => {
    expect(assertValidLesson(makeLesson()).id).toBe("lesson-1");
  });
});

describe("validateLesson — INV-1 Scene index", () => {
  it("scene.index 与数组下标不一致时 reject", () => {
    const lesson = makeLesson([
      makeScene(0),
      { ...makeScene(2), id: "scene-2" } as Scene,
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "INVALID_SCENE_INDEX")).toBe(
        true,
      );
    }
  });
});

describe("validateLesson — INV-2 roleId", () => {
  it("SPEECH 缺少 roleId 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          {
            id: "act-x",
            type: "SPEECH",
            text: "没有角色",
            showSubtitle: true,
            blocking: true,
          },
        ],
      }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "MISSING_ROLE_ID")).toBe(true);
    }
  });

  it("SPEECH 引用不存在的 roleId 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, { actions: [speech({ roleId: "ghost-role" })] }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "UNKNOWN_ROLE_ID")).toBe(true);
    }
  });
});

describe("validateLesson — INV-3 FOCUS elementId", () => {
  it("elementId 不属于当前 Scene 的 slide 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          speech(),
          {
            id: "act-focus",
            type: "FOCUS",
            elementId: "not-exist",
            style: "spotlight",
            durationMs: 500,
            blocking: true,
          },
        ],
      }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "FOREIGN_ELEMENT_ID")).toBe(
        true,
      );
    }
  });

  it("elementId 属于【其他 Scene】的 slide 时也要 reject", () => {
    // 关键用例：element 存在，但不在当前 Scene —— 不允许 best-effort 通过
    const scene0 = makeScene(0, {
      actions: [
        speech({ id: "a0" }),
        {
          id: "act-focus",
          type: "FOCUS",
          elementId: "el-2", // 属于 scene 2 的 slide
          style: "zoom",
          durationMs: 300,
          blocking: true,
        },
      ],
    });
    const scene1 = makeScene(1);
    const result = validateLesson(makeLesson([scene0, scene1]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "FOREIGN_ELEMENT_ID")).toBe(
        true,
      );
    }
  });

  it("elementId 属于当前 Scene 时通过", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          {
            id: "act-focus-ok",
            type: "FOCUS",
            elementId: "el-1",
            style: "spotlight",
            durationMs: 500,
            blocking: true,
          },
        ],
      }),
    ]);
    expect(validateLesson(lesson).ok).toBe(true);
  });
});

describe("validateLesson — INV-4 INTERACT choices", () => {
  it("open_question 带 choices 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          {
            id: "act-int",
            type: "INTERACT",
            kind: "open_question",
            prompt: "你怎么看？",
            choices: [{ id: "c1", text: "选项" }],
            acceptUserInput: true,
            blocking: true,
          },
        ],
      }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "INVALID_CHOICES")).toBe(true);
    }
  });

  it("quiz 带空 choices 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          {
            id: "act-int",
            type: "INTERACT",
            kind: "quiz",
            prompt: "选一个",
            choices: [],
            acceptUserInput: true,
            blocking: true,
          },
        ],
      }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "EMPTY_CHOICES")).toBe(true);
    }
  });
});

describe("validateLesson — INV-5 Role id 唯一", () => {
  it("重复 Role id 时 reject", () => {
    const lesson = makeLesson();
    const result = validateLesson({
      ...lesson,
      roles: [teacher, { ...student, id: teacher.id }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "DUPLICATE_ROLE_ID")).toBe(
        true,
      );
    }
  });
});

describe("validateLesson — INV-6 SLIDE slideId", () => {
  it("引用不存在的 slideId 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, {
        actions: [
          {
            id: "act-slide",
            type: "SLIDE",
            op: "show",
            slideId: "ghost-slide",
            blocking: false,
          },
        ],
      }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "UNKNOWN_SLIDE_ID")).toBe(true);
    }
  });
});

describe("validateLesson — INV-7 Action id 唯一", () => {
  it("同一 Scene 内重复 Action id 时 reject", () => {
    const lesson = makeLesson([
      makeScene(0, { actions: [speech({ id: "dup" }), speech({ id: "dup" })] }),
    ]);
    const result = validateLesson(lesson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "DUPLICATE_ACTION_ID")).toBe(
        true,
      );
    }
  });
});

describe("validateLesson — schema 层非法数据", () => {
  it("未知 Action type 被 schema 拒绝", () => {
    const result = validateAction({
      id: "a1",
      type: "DANCE",
      blocking: true,
    });
    expect(result.ok).toBe(false);
  });

  it("非法 ISO 时间被拒绝", () => {
    const lesson = makeLesson();
    const result = validateLesson({ ...lesson, createdAt: "昨天" });
    expect(result.ok).toBe(false);
  });

  it("Rect 超出 0~1 归一化范围被拒绝", () => {
    const lesson = makeLesson([
      makeScene(0, {
        slide: {
          id: "slide-1",
          layout: "content",
          elements: [
            {
              kind: "text",
              id: "el-1",
              text: "x",
              region: { x: 0, y: 0, w: 2, h: 1 },
            },
          ],
        },
      }),
    ]);
    expect(validateLesson(lesson).ok).toBe(false);
  });

  it("checkLessonInvariants 对合法 Lesson 返回空数组", () => {
    expect(checkLessonInvariants(makeLesson())).toEqual([]);
  });
});

describe("assertValidLesson 抛出结构化错误", () => {
  it("非法数据抛 ValidationError 且带 issues", () => {
    const lesson = makeLesson([
      makeScene(0, { actions: [speech({ roleId: "ghost" })] }),
    ]);
    expect(() => assertValidLesson(lesson)).toThrow(ValidationError);
    try {
      assertValidLesson(lesson);
    } catch (error) {
      const err = error as ValidationError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.retryable).toBe(true);
      expect(err.issues.length).toBeGreaterThan(0);
      expect(err.issues[0]?.path).toContain("roleId");
    }
  });
});

describe("PlaybackState 状态转换", () => {
  it("合法转换被允许", () => {
    expect(canTransition("idle", "loading")).toBe(true);
    expect(canTransition("ready", "playing")).toBe(true);
    expect(canTransition("playing", "paused")).toBe(true);
    expect(canTransition("paused", "playing")).toBe(true);
    expect(canTransition("playing", "waiting_for_user")).toBe(true);
    expect(canTransition("waiting_for_user", "playing")).toBe(true);
    expect(canTransition("playing", "finished")).toBe(true);
  });

  it("非法转换被拒绝", () => {
    expect(canTransition("idle", "playing")).toBe(false);
    expect(canTransition("finished", "playing")).toBe(false);
    expect(canTransition("paused", "finished")).toBe(false);
  });
});
