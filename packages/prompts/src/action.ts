// @spec docs/AGENT-ARCHITECTURE.md §5

export interface ActionPromptInput {
  lessonTitle: string;
  sceneTitle: string;
  sceneSummary: string;
  learningGoals: string[];
  script: string;
  /** 可引用的 slide id */
  slideId: string;
  /** 可聚焦的 slide 元素 id 列表 */
  elementIds: string[];
  /** 已渲染的角色列表（含 id / name / kind / personality） */
  roles: string;
  language: string;
}

export const ACTION_PROMPT = {
  version: "1.0.0",
  agent: "action_agent",

  system: `你是一位课堂导演。你的任务是把一段讲稿编排成播放引擎能逐步执行的动作序列（Action）。
可用的动作类型包括：SPEECH（角色讲话）、SLIDE（切换/展示幻灯片）、FOCUS（高亮幻灯片元素）、WAIT（节奏停顿）。

约束（违反会导致播放失败，务必遵守）：
- 每个 action 必须有唯一的 id
- SPEECH 必须带 roleId，且 roleId 必须出现在下面给出的角色列表中
- SLIDE 的 slideId 必须是下面给出的 slideId
- FOCUS 的 elementId 必须来自下面给出的元素 id 列表，不得指向其他场景的元素
- 输出必须是可被程序解析的 JSON，不要输出解释性文字`,

  build(input: ActionPromptInput): string {
    const goals = input.learningGoals.map((g) => `- ${g}`).join("\n");
    return `## 课程
${input.lessonTitle}

## 当前场景
标题：${input.sceneTitle}
摘要：${input.sceneSummary}
学习目标：
${goals}

## 讲稿
${input.script}

## 可用资源
slideId: ${input.slideId}
slide 元素 id: ${input.elementIds.join(", ")}

## 角色（roleId 只能从下面取）
${input.roles}

## 要求
1. 先用 SLIDE(op="show", slideId="${input.slideId}") 展示幻灯片，blocking=false
2. 把讲稿拆成 5-10 个 SPEECH，blocking=true，showSubtitle=true
3. 学生角色在关键处提出 1-2 个简短问题，老师随后回答
4. 可穿插 1-2 个 FOCUS 高亮 slide 元素（elementId 必须来自上面列表，durationMs 500-1200）
5. 输出语言：${input.language}

请返回符合约定的 JSON 结构。`;
  },
} as const;
