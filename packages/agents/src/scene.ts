// @spec docs/AGENT-ARCHITECTURE.md
// scene_agent：lesson + sceneIndex → slide + script（每个 Scene 独立，可并行）
//
// SIMPLIFIED IMPLEMENTATION：plan / critique 为规则化节点，draft 为真实 LLM 调用。

import { AppError } from "@aiclassroom/types";
import type { SceneOutput, TraceRecord } from "@aiclassroom/types";
import { SceneOutputSchema } from "@aiclassroom/types";
import { structuredOutput } from "@aiclassroom/llm";
import type { LlmClient, ModelConfig } from "@aiclassroom/llm";
import { SCENE_PROMPT, renderRoles } from "@aiclassroom/prompts";
import { runPipelineWithRepair } from "./pipeline";
import type { PipelineEvent } from "./pipeline";
import type { SceneDraftInput } from "./context";

export interface SceneAgentInput {
  scene: SceneDraftInput;
  model: ModelConfig;
  lessonId?: string | undefined;
  signal?: AbortSignal | undefined;
  client?: LlmClient | undefined;
  onEvent?: ((event: PipelineEvent) => void) | undefined;
}

export interface SceneAgentResult {
  output: SceneOutput;
  traces: TraceRecord[];
  events: PipelineEvent[];
}

interface SceneState {
  agent: SceneAgentInput;
  layout: "title" | "content" | "two-column" | "quote";
  draft: SceneOutput | undefined;
}

export async function runSceneAgent(
  input: SceneAgentInput,
): Promise<SceneAgentResult> {
  const result = await runPipelineWithRepair<SceneState>({
    agent: "scene_agent",
    signal: input.signal,
    onEvent: input.onEvent,
    initial: { agent: input, layout: "content", draft: undefined },
    steps: [
      {
        node: "retrieve",
        async run(state, ctx) {
          ctx.emit("retrieve", `读取第 ${state.agent.scene.scene.index + 1} 节上下文…`);
          return state;
        },
      },
      {
        // Plan：规则化选择 slide 版式（SIMPLIFIED IMPLEMENTATION）
        node: "plan",
        async run(state, ctx) {
          const { index, total } = state.agent.scene.scene;
          const layout =
            index === 0 ? "title" : index === total - 1 ? "quote" : "content";
          ctx.emit("plan", `选定版式：${layout}`);
          return { ...state, layout };
        },
      },
      {
        node: "draft",
        async run(state, ctx) {
          ctx.emit("draft", "正在生成幻灯片与讲稿…");
          const { scene, roles, language, lessonTitle, lessonDescription, topic } =
            state.agent.scene;
          const prompt = SCENE_PROMPT.build({
            lessonTitle,
            lessonDescription,
            topic,
            sceneIndex: scene.index,
            sceneCount: scene.total,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            learningGoals: scene.learningGoals,
            roles: renderRoles(roles),
            language,
            ...(state.agent.scene.previousSceneTitles === undefined
              ? {}
              : { previousSceneTitles: state.agent.scene.previousSceneTitles }),
          });

          const outcome = await structuredOutput(
            state.agent.model,
            {
              prompt,
              system: SCENE_PROMPT.system,
              schema: SceneOutputSchema,
              schemaName: "scene",
              ...(state.agent.signal === undefined
                ? {}
                : { abortSignal: state.agent.signal }),
            },
            {
              agent: "scene_agent",
              node: "draft",
              ...(state.agent.client === undefined
                ? {}
                : { client: state.agent.client }),
            },
          );
          ctx.traces.push(outcome.trace);
          return { ...state, draft: outcome.object };
        },
      },
      {
        node: "validate",
        async run(state, ctx) {
          if (state.draft === undefined) {
            throw new AppError("GENERATION_ERROR", "draft 节点未产出场景内容", {
              retryable: true,
            });
          }
          const parsed = SceneOutputSchema.safeParse(state.draft);
          if (!parsed.success) {
            throw new AppError(
              "VALIDATION_ERROR",
              `场景结构不合法：${parsed.error.issues.map((i) => i.message).join("; ")}`,
              { retryable: true },
            );
          }
          // 元素必须有 id，且坐标在归一化范围内（schema 已保证 0~1）
          const ids = parsed.data.slide.elements.map((el) => el.id);
          if (new Set(ids).size !== ids.length) {
            throw new AppError(
              "VALIDATION_ERROR",
              "slide 元素 id 重复",
              { retryable: true },
            );
          }
          ctx.emit("validate", "场景结构校验通过");
          return { ...state, draft: parsed.data };
        },
      },
      {
        // Critique：规则化自检（SIMPLIFIED IMPLEMENTATION）
        node: "critique",
        async run(state, ctx) {
          const draft = state.draft;
          if (draft === undefined) {
            throw new AppError("GENERATION_ERROR", "缺少草稿，无法自检", {
              retryable: true,
            });
          }
          const problems: string[] = [];
          if (draft.script.trim().length < 50) problems.push("讲稿过短");
          if (draft.script.trim().length > 3000) problems.push("讲稿过长");
          if (draft.slide.elements.length === 0) problems.push("slide 没有元素");
          if (draft.slide.elements.length > 8) problems.push("slide 元素过多");
          const emptyText = draft.slide.elements.some(
            (el) => el.kind === "text" && el.text.trim() === "",
          );
          if (emptyText) problems.push("存在空文本元素");
          if (problems.length > 0) {
            throw new AppError(
              "GENERATION_ERROR",
              `场景自检未通过：${problems.join("; ")}`,
              { retryable: true },
            );
          }
          ctx.emit("critique", "场景自检通过");
          return state;
        },
      },
      {
        // Finalize：归一化 ID（确定性赋值，不是「修复非法数据」）
        node: "finalize",
        async run(state, ctx) {
          const draft = state.draft;
          if (draft === undefined) {
            throw new AppError("GENERATION_ERROR", "缺少草稿，无法定稿", {
              retryable: false,
            });
          }
          const n = state.agent.scene.scene.index + 1;
          const finalized: SceneOutput = {
            slide: {
              ...draft.slide,
              id: `slide-${n}`,
              elements: draft.slide.elements.map((el, i) => ({
                ...el,
                id: `el-${n}-${i + 1}`,
              })),
            },
            script: draft.script,
          };
          ctx.emit("finalize", "场景定稿");
          return { ...state, draft: finalized };
        },
      },
    ],
  });

  if (result.state.draft === undefined) {
    throw new AppError("GENERATION_ERROR", "scene_agent 未产出结果", {
      retryable: true,
    });
  }

  return {
    output: result.state.draft,
    traces: result.traces,
    events: result.events,
  };
}
