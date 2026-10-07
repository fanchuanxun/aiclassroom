// @spec docs/AGENT-ARCHITECTURE.md §5

export interface ScenePromptInput {
  lessonTitle: string;
  lessonDescription: string;
  topic: string;
  sceneIndex: number;
  sceneCount: number;
  sceneTitle: string;
  sceneSummary: string;
  learningGoals: string[];
  /** 已渲染的角色设定文本 */
  roles: string;
  language: string;
  /** 已生成的前序场景标题，用于避免重复 */
  previousSceneTitles?: string[];
}

export const SCENE_PROMPT = {
  version: "1.0.0",
  agent: "scene_agent",

  system: `你是一位资深讲师兼课件设计师。你会为课程中的某一个场景产出：
1. 一张结构清晰的幻灯片（slide）
2. 一段该场景的完整讲稿（script）

slide 的坐标（region.x / region.y / region.w / region.h）必须是 0~1 的归一化值，
且元素之间不要重叠。输出必须是可被程序解析的 JSON，不要输出解释性文字。`,

  build(input: ScenePromptInput): string {
    const goals = input.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
    const previous = input.previousSceneTitles?.length
      ? `\n## 已讲过的前序场景（不要重复）\n${input.previousSceneTitles.map((t) => `- ${t}`).join("\n")}\n`
      : "";

    return `## 课程
标题：${input.lessonTitle}
简介：${input.lessonDescription}
主题：${input.topic}

## 当前场景（第 ${input.sceneIndex + 1} / ${input.sceneCount} 节）
标题：${input.sceneTitle}
摘要：${input.sceneSummary}

## 学习目标
${goals}
${previous}
## 课堂角色
${input.roles}

## 要求
1. slide 的 layout 选择最合适的一种；标题必填；elements 至少 2 个、至多 6 个
2. 元素 id 使用 "el-数字" 形式，slide.id 使用 "slide-${input.sceneIndex + 1}"
3. script 是老师在该场景的完整讲稿，口语化、有节奏，300-600 字
4. script 的备注（notes）用一句话概括本场景要点
5. 输出语言：${input.language}

请返回符合约定的 JSON 结构。`;
  },
} as const;
