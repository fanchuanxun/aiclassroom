// @spec docs/DATA-MODEL.md §3.2 / docs/PLAN.md (Phase 1A)
// 默认角色工厂：1 位老师 + 1 位学生。
// 角色 id 在课程内固定且唯一（满足 INV-5）。后续可由用户在「角色确认」环节编辑。

import type { Role } from "@aiclassroom/types";

export function defaultRoles(): Role[] {
  return [
    {
      id: "role-teacher",
      name: "林老师",
      kind: "teacher",
      avatarUrl: "🧑‍🏫",
      personality: "耐心、严谨、善于用生活化比喻把复杂概念讲清楚",
      bio: "十年 AI 科普教学经验，擅长启发式提问",
      voice: { provider: "web-speech", lang: "zh-CN" },
      promptPersona:
        "你是一位严谨而亲切的中学老师，讲解清晰、循序渐进，多用类比与例子。",
      color: "#2563eb",
    },
    {
      id: "role-student",
      name: "小明",
      kind: "student",
      avatarUrl: "🧑‍🎓",
      personality: "好奇、爱追问、偶尔会答错",
      bio: "喜欢问「为什么」的初中生",
      voice: { provider: "web-speech", lang: "zh-CN" },
      promptPersona: "你是一个爱提问的中学生，会顺着老师的讲解提出自己的疑问。",
      color: "#16a34a",
    },
  ];
}
