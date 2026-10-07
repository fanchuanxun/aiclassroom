// @spec docs/AGENT-ARCHITECTURE.md §5
// Prompt 集中管理，带版本号，禁止内联在业务代码。

export interface OutlinePromptInput {
  topic: string;
  /** 已渲染的角色设定文本 */
  roles: string;
  language: string;
  /** 用户素材（已渲染），可为空 */
  materials?: string;
  sceneCount?: number;
}

export const OUTLINE_PROMPT = {
  version: "1.0.0",
  agent: "outline_agent",

  system: `你是一位专业的课程设计师，擅长把任意主题拆解成结构清晰、循序渐进的互动课程大纲。
你的输出会被程序直接解析为结构化数据，必须严格遵守约定的 JSON 结构，不要输出任何解释性文字。
【强制约束】你必须严格围绕用户给定的「主题」来设计课程：所有场景标题与内容都不得偏离该主题，禁止生成与主题无关的通用或泛化课程（例如给定天文主题却输出"复杂系统入门"这类不相关内容）。`,

  build(input: OutlinePromptInput): string {
    const sceneCount = input.sceneCount ?? 2;
    const materials = input.materials
      ? `\n## 参考资料\n${input.materials}\n`
      : "";

    return `## 主题（必须严格围绕此主题生成课程，禁止偏离）
${input.topic}
${materials}
## 课堂角色
${input.roles}

## 要求
1. 【强制】课程所有内容必须紧扣上述「主题」，不得生成与主题无关的泛化课程。
2. 【强制】必须恰好生成 ${sceneCount} 个场景（Scene），不多不少，场景之间必须有递进关系
3. 每个场景有 1-3 条明确、可衡量的学习目标
4. 总时长控制在 20-30 分钟
5. 输出语言：${input.language}
6. 场景标题要简洁有力，摘要要说明该场景讲什么、为什么重要

请返回符合约定的 JSON 结构。`;
  },
} as const;
