// @spec docs/AGENT-ARCHITECTURE.md
// outline_agent：topic + roles → Lesson 骨架
//
// SIMPLIFIED IMPLEMENTATION：
//   - plan 节点采用规则化范围界定（不额外调用 LLM），以守住「生成大纲 P50 < 15s」预算
//   - critique 节点采用规则化自检（字段完整度、场景数、目标数、标题长度）
//   真实 LLM 调用发生在 draft 节点（structuredOutput）。

import { AppError } from "@aiclassroom/types";
import type {
  Language,
  Material,
  OutlineOutput,
  Role,
  TraceRecord,
} from "@aiclassroom/types";
import { OutlineOutputSchema } from "@aiclassroom/types";
import { structuredOutput } from "@aiclassroom/llm";
import type { LlmClient, ModelConfig } from "@aiclassroom/llm";
import { OUTLINE_PROMPT, renderRoles } from "@aiclassroom/prompts";
import { runPipelineWithRepair } from "./pipeline";
import type { PipelineEvent } from "./pipeline";

export interface OutlineAgentInput {
  topic: string;
  roles: readonly Role[];
  materials?: readonly Material[];
  language: Language;
  sceneCount?: number;
  model: ModelConfig;
  lessonId?: string | undefined;
  signal?: AbortSignal | undefined;
  client?: LlmClient | undefined;
  onEvent?: ((event: PipelineEvent) => void) | undefined;
}

export interface OutlineAgentResult {
  outline: OutlineOutput;
  traces: TraceRecord[];
  events: PipelineEvent[];
}

interface OutlineState {
  input: OutlineAgentInput;
  rolesText: string;
  materialsText: string;
  plannedSceneCount: number;
  draft: OutlineOutput | undefined;
}

function renderMaterials(materials: readonly Material[] | undefined): string {
  if (!materials || materials.length === 0) return "";
  return materials
    .map((m) => `- ${m.title}：${m.content ?? m.url ?? ""}`)
    .join("\n");
}

export async function runOutlineAgent(
  input: OutlineAgentInput,
): Promise<OutlineAgentResult> {
  const result = await runPipelineWithRepair<OutlineState>({
    agent: "outline_agent",
    signal: input.signal,
    onEvent: input.onEvent,
    initial: {
      input,
      rolesText: "",
      materialsText: "",
      plannedSceneCount: input.sceneCount ?? 2,
      draft: undefined,
    },
    steps: [
      {
        // Retrieve：组装上下文
        node: "retrieve",
        async run(state, ctx) {
          ctx.emit("retrieve", "正在组装角色与素材上下文…");
          return {
            ...state,
            rolesText: renderRoles(state.input.roles),
            materialsText: renderMaterials(state.input.materials),
          };
        },
      },
      {
        // Plan：规则化范围界定（SIMPLIFIED IMPLEMENTATION）
        node: "plan",
        async run(state, ctx) {
          const planned = state.input.sceneCount ?? 2;
          ctx.emit("plan", `规划场景数：${planned}`);
          return { ...state, plannedSceneCount: planned };
        },
      },
      {
        // Draft：真实 LLM 结构化输出
        node: "draft",
        async run(state, ctx) {
          ctx.emit("draft", "正在生成课程大纲…");
          const prompt = OUTLINE_PROMPT.build({
            topic: state.input.topic,
            roles: state.rolesText,
            language: state.input.language,
            sceneCount: state.plannedSceneCount,
            ...(state.materialsText === ""
              ? {}
              : { materials: state.materialsText }),
          });

          const outcome = await structuredOutput(
            state.input.model,
            {
              prompt,
              system: OUTLINE_PROMPT.system,
              schema: OutlineOutputSchema,
              schemaName: "outline",
              ...(state.input.signal === undefined
                ? {}
                : { abortSignal: state.input.signal }),
            },
            {
              agent: "outline_agent",
              node: "draft",
              ...(state.input.client === undefined
                ? {}
                : { client: state.input.client }),
            },
          );
          ctx.traces.push(outcome.trace);
          return { ...state, draft: outcome.object };
        },
      },
      {
        // Validate：Zod schema 校验（schema 已在 structuredOutput 内强校验）
        node: "validate",
        async run(state, ctx) {
          if (state.draft === undefined) {
            throw new AppError("GENERATION_ERROR", "draft 节点未产出大纲", {
              retryable: true,
            });
          }
          const parsed = OutlineOutputSchema.safeParse(state.draft);
          if (!parsed.success) {
            throw new AppError(
              "VALIDATION_ERROR",
              `大纲结构不合法：${parsed.error.issues.map((i) => i.message).join("; ")}`,
              { retryable: true },
            );
          }
          ctx.emit("validate", "大纲结构校验通过");
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
          const lo = Math.max(1, state.plannedSceneCount - 1);
          const hi = state.plannedSceneCount + 1;
          if (draft.scenes.length < lo) problems.push(`场景数量少于 ${lo}`);
          if (draft.scenes.length > hi) problems.push(`场景数量多于 ${hi}`);
          if (draft.estimatedDurationMin <= 0)
            problems.push("预计时长必须为正数");
          draft.scenes.forEach((scene, i) => {
            if (scene.learningGoals.length === 0)
              problems.push(`场景 ${i + 1} 缺少学习目标`);
            if (scene.title.length > 40)
              problems.push(`场景 ${i + 1} 标题过长`);
          });
          if (problems.length > 0) {
            throw new AppError(
              "GENERATION_ERROR",
              `大纲自检未通过：${problems.join("; ")}`,
              { retryable: true },
            );
          }
          ctx.emit("critique", "大纲自检通过");
          return state;
        },
      },
      {
        // Finalize：归一化产出
        node: "finalize",
        async run(state, ctx) {
          const draft = state.draft;
          if (draft === undefined) {
            throw new AppError("GENERATION_ERROR", "缺少草稿，无法定稿", {
              retryable: false,
            });
          }
          ctx.emit("finalize", "大纲定稿");
          return { ...state, draft };
        },
      },
    ],
  });

  if (result.state.draft === undefined) {
    throw new AppError("GENERATION_ERROR", "outline_agent 未产出结果", {
      retryable: true,
    });
  }

  return {
    outline: result.state.draft,
    traces: result.traces,
    events: result.events,
  };
}
