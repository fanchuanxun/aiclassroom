// @spec docs/TESTING.md
// Agent 测试：用 mock client 控制 LLM 输出，验证真实流水线行为（含失败分支）。
import { describe, expect, it } from "vitest";
import type { Action, Role, Scene, Slide } from "@aiclassroom/types";
import { ValidationError } from "@aiclassroom/types";
import { createMockLlmClient } from "@aiclassroom/llm/testing";
import type { ModelConfig } from "@aiclassroom/llm";
import { runOutlineAgent } from "./outline";
import { runSceneAgent } from "./scene";
import { runActionAgent } from "./action";
import type { ActionDraftInput, SceneDraftInput } from "./context";

const model: ModelConfig = { provider: "openai", modelId: "gpt-4o-mini" };

const teacher: Role = {
  id: "teacher-li",
  name: "李老师",
  kind: "teacher",
  avatarUrl: "T",
  personality: "耐心细致",
  bio: "十年教学经验",
  voice: { provider: "web-speech" },
  promptPersona: "你是讲师",
  color: "#4F46E5",
};

const student: Role = {
  id: "student-mei",
  name: "小美",
  kind: "student",
  avatarUrl: "S",
  personality: "认真好学",
  bio: "好奇心强",
  voice: { provider: "web-speech" },
  promptPersona: "你是学生",
  color: "#EC4899",
};

const roles = [teacher, student];

const validOutline = {
  title: "人工智能入门",
  description: "从零理解人工智能",
  scenes: [
    { title: "什么是 AI", summary: "定义与历史", learningGoals: ["理解 AI 定义"] },
    { title: "机器学习", summary: "基本原理", learningGoals: ["理解监督学习"] },
    { title: "深度学习", summary: "神经网络", learningGoals: ["理解神经网络"] },
    { title: "应用场景", summary: "落地案例", learningGoals: ["列举典型应用"] },
  ],
  estimatedDurationMin: 25,
  difficulty: "beginner",
};

const validScript =
  "同学们好，今天我们来认识人工智能。人工智能是让机器模拟人类智能行为的一门学科，它包含感知、推理、学习与决策等能力。我们先从定义讲起，再逐步深入到机器学习与深度学习。";

const validSceneOutput = {
  slide: {
    id: "slide-1",
    layout: "title",
    title: "什么是 AI",
    elements: [
      {
        kind: "text",
        id: "el-1",
        text: "人工智能的定义",
        region: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 },
      },
      {
        kind: "list",
        id: "el-2",
        items: ["弱人工智能", "强人工智能"],
        ordered: false,
        region: { x: 0.1, y: 0.45, w: 0.8, h: 0.4 },
      },
    ],
    notes: "本场景要点",
  },
  script: validScript,
};

function makeSlide(slideId: string, elementIds: readonly string[]): Slide {
  return {
    id: slideId,
    layout: "title",
    title: "什么是 AI",
    elements: elementIds.map((id) => ({
      kind: "text",
      id,
      text: "内容",
      region: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 },
    })),
  };
}

function sceneBrief(): SceneDraftInput {
  return {
    lessonTitle: "人工智能入门",
    lessonDescription: "从零理解人工智能",
    topic: "人工智能是什么？",
    language: "zh-CN",
    roles,
    scene: {
      id: "scene-1",
      index: 0,
      total: 4,
      title: "什么是 AI",
      summary: "定义与历史",
      learningGoals: ["理解 AI 定义"],
    },
  };
}

function actionInput(slide: Slide): ActionDraftInput {
  const scene: Scene = {
    id: "scene-1",
    index: 0,
    title: "什么是 AI",
    summary: "定义与历史",
    learningGoals: ["理解 AI 定义"],
    slide,
    actions: [],
    status: "generating",
  };
  return {
    lessonTitle: "人工智能入门",
    language: "zh-CN",
    roles,
    scene,
    slide,
    script: validScript,
    knownSlideIds: [slide.id],
  };
}

describe("outline_agent", () => {
  it("成功产出大纲，并留下 1 条 trace 与完整节点事件", async () => {
    const client = createMockLlmClient({
      objects: [validOutline],
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const result = await runOutlineAgent({
      topic: "人工智能是什么？",
      roles,
      language: "zh-CN",
      sceneCount: 4,
      model,
      client,
    });

    expect(result.outline.title).toBe("人工智能入门");
    expect(result.outline.scenes).toHaveLength(4);
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]?.status).toBe("ok");
    expect(result.traces[0]?.agent).toBe("outline_agent");
    expect(result.traces[0]?.node).toBe("draft");
    expect(result.traces[0]?.outputTokens).toBe(50);

    const nodes = result.events
      .filter((e) => e.type === "node_start")
      .map((e) => (e.type === "node_start" ? e.node : ""));
    expect(nodes).toEqual([
      "retrieve",
      "plan",
      "draft",
      "validate",
      "critique",
      "finalize",
    ]);
  });

  it("模型产出不合法时抛错，不产出半成品", async () => {
    const client = createMockLlmClient({
      objects: [{ ...validOutline, scenes: [] }],
    });
    await expect(
      runOutlineAgent({
        topic: "x",
        roles,
        language: "zh-CN",
        model,
        client,
      }),
    ).rejects.toThrow();
  });
});

describe("scene_agent", () => {
  it("产出 slide + script，并归一化 ID", async () => {
    const client = createMockLlmClient({ objects: [validSceneOutput] });
    const result = await runSceneAgent({ scene: sceneBrief(), model, client });

    expect(result.output.slide.id).toBe("slide-1");
    expect(result.output.slide.elements.map((e) => e.id)).toEqual([
      "el-1-1",
      "el-1-2",
    ]);
    expect(result.output.script.length).toBeGreaterThan(50);
    expect(result.traces).toHaveLength(1);
  });

  it("讲稿过短时自检不通过", async () => {
    const client = createMockLlmClient({
      objects: [{ ...validSceneOutput, script: "太短了" }],
    });
    await expect(
      runSceneAgent({ scene: sceneBrief(), model, client }),
    ).rejects.toThrow(/自检未通过/);
  });
});

describe("action_agent", () => {
  const validActions: Action[] = [
    { id: "a1", type: "SLIDE", op: "show", slideId: "slide-1", blocking: false },
    {
      id: "a2",
      type: "SPEECH",
      roleId: "teacher-li",
      text: "同学们好。",
      showSubtitle: true,
      blocking: true,
    },
    {
      id: "a3",
      type: "SPEECH",
      roleId: "student-mei",
      text: "老师，AI 和程序有什么区别？",
      showSubtitle: true,
      blocking: true,
    },
    {
      id: "a4",
      type: "SPEECH",
      roleId: "teacher-li",
      text: "好问题，区别在于 AI 能从数据中学习。",
      showSubtitle: true,
      blocking: true,
    },
    {
      id: "a5",
      type: "FOCUS",
      elementId: "el-1-1",
      style: "spotlight",
      durationMs: 800,
      blocking: true,
    },
  ];

  it("产出 Action 序列，并给 id 加场景前缀保证全局唯一", async () => {
    const slide = makeSlide("slide-1", ["el-1-1", "el-1-2"]);
    const client = createMockLlmClient({ objects: [{ actions: validActions }] });
    const result = await runActionAgent({
      input: actionInput(slide),
      model,
      client,
    });

    expect(result.actions.map((a) => a.id)).toEqual([
      "s1-a1",
      "s1-a2",
      "s1-a3",
      "s1-a4",
      "s1-a5",
    ]);
    expect(result.actions.some((a) => a.type === "SLIDE")).toBe(true);
    expect(result.traces).toHaveLength(1);
  });

  it("FOCUS 指向其他 Scene 的 elementId 时 reject（INV-3）", async () => {
    const slide = makeSlide("slide-1", ["el-1-1"]);
    const badActions: Action[] = [
      { id: "a1", type: "SLIDE", op: "show", slideId: "slide-1", blocking: false },
      {
        id: "a2",
        type: "SPEECH",
        roleId: "teacher-li",
        text: "开始",
        showSubtitle: true,
        blocking: true,
      },
      {
        id: "a3",
        type: "FOCUS",
        elementId: "el-2-1",
        style: "zoom",
        durationMs: 500,
        blocking: true,
      },
    ];
    const client = createMockLlmClient({ objects: [{ actions: badActions }] });

    let caught: unknown;
    try {
      await runActionAgent({ input: actionInput(slide), model, client });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(
      (caught as ValidationError).issues.some(
        (i) => i.code === "FOREIGN_ELEMENT_ID",
      ),
    ).toBe(true);
  });

  it("引用不存在的 roleId 时 reject（INV-2）", async () => {
    const slide = makeSlide("slide-1", ["el-1-1"]);
    const badActions: Action[] = [
      { id: "a1", type: "SLIDE", op: "show", slideId: "slide-1", blocking: false },
      {
        id: "a2",
        type: "SPEECH",
        roleId: "ghost-role",
        text: "开始",
        showSubtitle: true,
        blocking: true,
      },
    ];
    const client = createMockLlmClient({ objects: [{ actions: badActions }] });

    let caught: unknown;
    try {
      await runActionAgent({ input: actionInput(slide), model, client });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(
      (caught as ValidationError).issues.some(
        (i) => i.code === "UNKNOWN_ROLE_ID",
      ),
    ).toBe(true);
  });

  it("缺少老师台词时自检不通过", async () => {
    const slide = makeSlide("slide-1", ["el-1-1"]);
    const badActions: Action[] = [
      { id: "a1", type: "SLIDE", op: "show", slideId: "slide-1", blocking: false },
      {
        id: "a2",
        type: "SPEECH",
        roleId: "student-mei",
        text: "老师呢？",
        showSubtitle: true,
        blocking: true,
      },
    ];
    const client = createMockLlmClient({ objects: [{ actions: badActions }] });

    await expect(
      runActionAgent({ input: actionInput(slide), model, client }),
    ).rejects.toThrow(/老师没有任何台词/);
  });
});
