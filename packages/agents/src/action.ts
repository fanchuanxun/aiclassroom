// @spec docs/AGENT-ARCHITECTURE.md
// action_agent：scene（含 slide + script）→ Action[]
//
// 关键：draft 之后必须用 packages/types 的运行时不变量校验，
// 非法数据（不存在的 roleId / 不属于本 Scene 的 elementId / 重复 id）一律 reject，禁止自动修复。

import { AppError, ValidationError } from "@aiclassroom/types";
import type { Action, Scene, TraceRecord } from "@aiclassroom/types";
import { ActionOutputSchema } from "@aiclassroom/types";
import { validateScene } from "@aiclassroom/types";
import { structuredOutput } from "@aiclassroom/llm";
import type { LlmClient, ModelConfig } from "@aiclassroom/llm";
import { ACTION_PROMPT, renderRoles } from "@aiclassroom/prompts";
import { runPipelineWithRepair } from "./pipeline";
import type { PipelineEvent } from "./pipeline";
import type { ActionDraftInput } from "./context";

export interface ActionAgentInput {
  input: ActionDraftInput;
  model: ModelConfig;
  lessonId?: string | undefined;
  signal?: AbortSignal | undefined;
  client?: LlmClient | undefined;
  onEvent?: ((event: PipelineEvent) => void) | undefined;
}

export interface ActionAgentResult {
  actions: Action[];
  traces: TraceRecord[];
  events: PipelineEvent[];
}

interface ActionState {
  agent: ActionAgentInput;
  draft: Action[] | undefined;
}

export async function runActionAgent(
  input: ActionAgentInput,
): Promise<ActionAgentResult> {
  const result = await runPipelineWithRepair<ActionState>({
    agent: "action_agent",
    signal: input.signal,
    onEvent: input.onEvent,
    initial: { agent: input, draft: undefined },
    steps: [
      {
        node: "retrieve",
        async run(state, ctx) {
          const { scene } = state.agent.input;
          ctx.emit(
            "retrieve",
            `读取第 ${scene.index + 1} 节的 slide 元素与角色列表…`,
          );
          return state;
        },
      },
      {
        // Plan：规则化确定目标 action 数量（SIMPLIFIED IMPLEMENTATION）
        node: "plan",
        async run(state, ctx) {
          const scriptLength = state.agent.input.script.length;
          const target = Math.min(12, Math.max(4, Math.round(scriptLength / 90)));
          ctx.emit("plan", `目标动作数：${target}`);
          return state;
        },
      },
      {
        node: "draft",
        async run(state, ctx) {
          ctx.emit("draft", "正在编排教学动作…");
          const { scene, roles, language, lessonTitle, slide, script } =
            state.agent.input;

          const prompt = ACTION_PROMPT.build({
            lessonTitle,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            learningGoals: scene.learningGoals,
            script,
            slideId: slide.id,
            elementIds: slide.elements.map((el) => el.id),
            roles: renderRoles(roles),
            language,
          });

          const outcome = await structuredOutput(
            state.agent.model,
            {
              prompt,
              system: ACTION_PROMPT.system,
              schema: ActionOutputSchema,
              schemaName: "actions",
              ...(state.agent.signal === undefined
                ? {}
                : { abortSignal: state.agent.signal }),
            },
            {
              agent: "action_agent",
              node: "draft",
              ...(state.agent.client === undefined
                ? {}
                : { client: state.agent.client }),
            },
          );
          ctx.traces.push(outcome.trace);
          return { ...state, draft: outcome.object.actions };
        },
      },
      {
        // Validate：schema + 运行时不变量（INV-1..INV-7）
        node: "validate",
        async run(state, ctx) {
          if (state.draft === undefined) {
            throw new AppError("GENERATION_ERROR", "draft 节点未产出动作序列", {
              retryable: true,
            });
          }
          const parsed = ActionOutputSchema.safeParse({ actions: state.draft });
          if (!parsed.success) {
            throw new AppError(
              "VALIDATION_ERROR",
              `动作结构不合法：${parsed.error.issues.map((i) => i.message).join("; ")}`,
              { retryable: true },
            );
          }

          const { scene, roles, slide, knownSlideIds } = state.agent.input;
          const sceneWithActions: Scene = {
            ...scene,
            slide,
            actions: parsed.data.actions,
          };
          const validated = validateScene(sceneWithActions, {
            roleIds: new Set(roles.map((r) => r.id)),
            knownSlideIds: new Set(knownSlideIds),
          });

          if (!validated.ok) {
            throw new ValidationError(validated.issues);
          }
          ctx.emit("validate", `动作校验通过（${parsed.data.actions.length} 个动作）`);
          return { ...state, draft: parsed.data.actions };
        },
      },
      {
        // Critique：规则化自检（SIMPLIFIED IMPLEMENTATION）
        node: "critique",
        async run(state, ctx) {
          const actions = state.draft;
          if (actions === undefined) {
            throw new AppError("GENERATION_ERROR", "缺少草稿，无法自检", {
              retryable: true,
            });
          }
          const problems: string[] = [];
          if (!actions.some((a) => a.type === "SLIDE"))
            problems.push("缺少 SLIDE 动作，课堂不会展示幻灯片");
          if (!actions.some((a) => a.type === "SPEECH"))
            problems.push("缺少 SPEECH 动作，课堂没有讲解");
          if (actions.length > 20) problems.push("动作数量过多，节奏会拖沓");
          const teacherSpeech = actions.filter(
            (a) => a.type === "SPEECH" && a.roleId === state.agent.input.roles.find((r) => r.kind === "teacher")?.id,
          );
          if (teacherSpeech.length === 0) problems.push("老师没有任何台词");
          if (problems.length > 0) {
            throw new AppError(
              "GENERATION_ERROR",
              `动作自检未通过：${problems.join("; ")}`,
              { retryable: true },
            );
          }
          ctx.emit("critique", "动作自检通过");
          return state;
        },
      },
      {
        // Finalize：给 action id 加场景前缀，保证课程内全局唯一
        node: "finalize",
        async run(state, ctx) {
          const actions = state.draft;
          if (actions === undefined) {
            throw new AppError("GENERATION_ERROR", "缺少草稿，无法定稿", {
              retryable: false,
            });
          }
          const prefix = `s${state.agent.input.scene.index + 1}`;
          const idOf = (id: string): string => `${prefix}-${id}`;
          const finalized = actions.map((action) => ({
            ...action,
            id: idOf(action.id),
            ...(action.type === "INTERACT" && action.onAnswer?.branchToActionId
              ? {
                  onAnswer: {
                    ...action.onAnswer,
                    branchToActionId: idOf(action.onAnswer.branchToActionId),
                  },
                }
              : {}),
          }));
          ctx.emit("finalize", "动作定稿");
          return { ...state, draft: finalized };
        },
      },
    ],
  });

  if (result.state.draft === undefined) {
    throw new AppError("GENERATION_ERROR", "action_agent 未产出结果", {
      retryable: true,
    });
  }

  return {
    actions: result.state.draft,
    traces: result.traces,
    events: result.events,
  };
}
