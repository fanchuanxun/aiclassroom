// @spec docs/TESTING.md (Runtime Tests)
import { describe, it, expect } from "vitest";
import type { Lesson, Scene, Slide, Action } from "@aiclassroom/types";
import { createId } from "@aiclassroom/types";
import { Player } from "./engine";
import type { RuntimeDeps } from "./types";

function slide(id: string): Slide {
  return {
    id,
    layout: "content",
    title: "t",
    elements: [{ kind: "text", id: `${id}-el`, text: "x", region: { x: 0, y: 0, w: 1, h: 1 } }],
  };
}

function scene(index: number, slideId: string, actions: Action[]): Scene {
  return {
    id: `scene-${index}`,
    index,
    title: `场景${index}`,
    summary: "s",
    learningGoals: ["g"],
    slide: slide(slideId),
    actions,
    status: "ready",
  };
}

function buildLesson(): Lesson {
  const teacher = "role-teacher";
  const speech = (id: string, n: number): Action => ({
    id: `${id}-SPEECH`,
    type: "SPEECH",
    roleId: teacher,
    text: `台词${n}`,
    showSubtitle: true,
    blocking: true,
  });
  return {
    id: createId(),
    title: "测试课",
    description: "d",
    topic: "t",
    language: "zh-CN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "ready",
    roles: [
      { id: teacher, name: "师", kind: "teacher", avatarUrl: "🧑", personality: "p", bio: "b", voice: { provider: "web-speech" }, promptPersona: "x", color: "#000" },
      { id: "role-student", name: "生", kind: "student", avatarUrl: "🧑‍🎓", personality: "p", bio: "b", voice: { provider: "web-speech" }, promptPersona: "x", color: "#111" },
    ],
    scenes: [
      scene(0, "slide-0", [
        { id: "s0-SLIDE", type: "SLIDE", op: "show", slideId: "slide-0", blocking: true },
        speech("s0", 1),
      ]),
      scene(1, "slide-1", [
        { id: "s1-SLIDE", type: "SLIDE", op: "show", slideId: "slide-1", blocking: true },
        speech("s1", 2),
      ]),
    ],
    meta: { difficulty: "beginner", estimatedDurationMin: 5 },
  };
}

function makeDeps() {
  const calls = {
    speak: 0,
    showSlide: [] as (string | undefined)[],
    interact: 0,
    discuss: 0,
  };
  const deps: RuntimeDeps = {
    speak: async () => {
      calls.speak += 1;
    },
    showSlide: (id) => calls.showSlide.push(id),
    focusElement: () => undefined,
    drawWhiteboard: () => undefined,
    promptInteract: async () => {
      calls.interact += 1;
      return { submittedAt: new Date().toISOString() };
    },
    runDiscuss: async () => {
      calls.discuss += 1;
    },
    wait: (ms, signal) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          resolve();
        }, { once: true });
      }),
  };
  return { deps, calls };
}

describe("runtime/Player", () => {
  it("播放到结束：所有 SPEECH 被朗读、每个场景 slide 被展示", async () => {
    const { deps, calls } = makeDeps();
    const player = new Player({ lesson: buildLesson(), deps });
    let last: string = "idle";
    player.subscribe((s) => (last = s.status));
    await player.play();
    // 等待循环结束
    while (last !== "finished") {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(calls.speak).toBe(2);
    expect(calls.showSlide).toContain("slide-0");
    expect(calls.showSlide).toContain("slide-1");
    expect(player.getState().status).toBe("finished");
    expect(player.getState().currentSceneIndex).toBe(2);
  });

  it("gotoScene 跳到指定场景并进入暂停态", () => {
    const { deps } = makeDeps();
    const player = new Player({ lesson: buildLesson(), deps });
    player.gotoScene(1);
    const s = player.getState();
    expect(s.status).toBe("paused");
    expect(s.currentSceneIndex).toBe(1);
    expect(s.currentActionIndex).toBe(0);
  });

  it("speak 抛错（非中止）时进入 error 状态并记录错误", async () => {
    const { deps } = makeDeps();
    deps.speak = async () => {
      throw new Error("TTS 崩溃");
    };
    const player = new Player({ lesson: buildLesson(), deps });
    await player.play();
    // 等待循环结束
    while (player.getState().status === "playing") {
      await new Promise((r) => setTimeout(r, 5));
    }
    const s = player.getState();
    expect(s.status).toBe("error");
    expect(s.errors.length).toBeGreaterThan(0);
  });

  it("暂停发生在 WAIT 动作中途时保留当前索引，可恢复重放", async () => {
    const { deps } = makeDeps();
    const lesson = buildLesson();
    // 把第一个场景改成 SLIDE + WAIT(300)
    lesson.scenes[0]!.actions = [
      { id: "s0-SLIDE", type: "SLIDE", op: "show", slideId: "slide-0", blocking: true },
      { id: "s0-WAIT", type: "WAIT", durationMs: 300, blocking: true },
    ];
    const player = new Player({ lesson, deps });
    void player.play();
    await new Promise((r) => setTimeout(r, 20));
    player.pause();
    await new Promise((r) => setTimeout(r, 80));
    const s = player.getState();
    expect(s.status).toBe("paused");
    // 仍停在 WAIT 动作（索引 1），未被推进
    expect(s.currentSceneIndex).toBe(0);
    expect(s.currentActionIndex).toBe(1);
  });
});
