// @spec docs/AGENT-ARCHITECTURE.md
// Agent 之间传递的上下文类型。刻意与 Lesson 解耦，便于单测。

import type { Language, Role, Scene, Slide } from "@aiclassroom/types";

export interface SceneBrief {
  id: string;
  index: number;
  /** 该 Lesson 一共有多少 Scene */
  total: number;
  title: string;
  summary: string;
  learningGoals: string[];
}

/** scene_agent 的输入 */
export interface SceneDraftContext {
  lessonTitle: string;
  lessonDescription: string;
  topic: string;
  language: Language;
  roles: readonly Role[];
  scene: SceneBrief;
  previousSceneTitles?: string[];
}

export type SceneDraftInput = SceneDraftContext;

/** action_agent 的输入：已有 slide + 讲稿的 Scene */
export interface ActionDraftContext {
  lessonTitle: string;
  language: Language;
  roles: readonly Role[];
  /** 当前 Scene 骨架（含 status / actions 占位） */
  scene: Scene;
  /** scene_agent 产出的幻灯片 */
  slide: Slide;
  /** scene_agent 产出的讲稿 */
  script: string;
  /** 本课程全部已知 slide id（INV-6 校验用） */
  knownSlideIds: string[];
}

export type ActionDraftInput = ActionDraftContext;
