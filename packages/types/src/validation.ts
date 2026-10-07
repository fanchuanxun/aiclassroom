// @spec docs/DATA-MODEL.md §4
// 运行时不变量强制校验。
//
// 策略：非法数据一律 reject，返回结构化 issue 列表。
// 禁止：自动猜测 / 自动修复 / 静默忽略 / best-effort 播放。

import type { z } from "zod";
import { ActionSchema } from "./action";
import type { Action } from "./action";
import { LessonSchema } from "./lesson";
import type { Lesson } from "./lesson";
import { SceneSchema } from "./scene";
import type { Scene } from "./scene";
import { ValidationError } from "./errors";
import type { ValidationIssue } from "./errors";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: ValidationIssue[] };

function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    code: String(issue.code),
    message: issue.message,
  }));
}

/**
 * 检查单个 Scene 内的 Action 级不变量。
 * `sceneSlideElementIds` 为「当前 Scene 的 slide」元素 ID 集合（INV-3 要求）。
 */
function checkSceneActions(
  scene: Scene,
  sceneIndex: number,
  roleIds: ReadonlySet<string>,
  knownSlideIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  const seenActionIds = new Set<string>();

  scene.actions.forEach((action: Action, actionIndex: number) => {
    const base = `scenes[${sceneIndex}].actions[${actionIndex}]`;

    // INV-7：同一 Scene 内 Action id 唯一
    if (seenActionIds.has(action.id)) {
      issues.push({
        path: `${base}.id`,
        code: "DUPLICATE_ACTION_ID",
        message: `Action id 重复：${action.id}`,
      });
    }
    seenActionIds.add(action.id);

    // INV-2：SPEECH / DISCUSS 必须带 roleId 且必须存在
    if (action.type === "SPEECH" || action.type === "DISCUSS") {
      if (action.roleId === undefined) {
        issues.push({
          path: `${base}.roleId`,
          code: "MISSING_ROLE_ID",
          message: `${action.type} action 必须带 roleId`,
        });
      } else if (!roleIds.has(action.roleId)) {
        issues.push({
          path: `${base}.roleId`,
          code: "UNKNOWN_ROLE_ID",
          message: `roleId "${action.roleId}" 不存在于 Lesson.roles`,
        });
      }
    } else if (action.roleId !== undefined && !roleIds.has(action.roleId)) {
      issues.push({
        path: `${base}.roleId`,
        code: "UNKNOWN_ROLE_ID",
        message: `roleId "${action.roleId}" 不存在于 Lesson.roles`,
      });
    }

    switch (action.type) {
      case "FOCUS": {
        // INV-3：elementId 必须属于当前 Scene 的 slide
        if (!scene.slide) {
          issues.push({
            path: `${base}.elementId`,
            code: "NO_SLIDE_IN_SCENE",
            message: `当前 Scene 没有 slide，无法聚焦 element "${action.elementId}"`,
          });
        } else {
          const elementIds = new Set(scene.slide.elements.map((el) => el.id));
          if (!elementIds.has(action.elementId)) {
            issues.push({
              path: `${base}.elementId`,
              code: "FOREIGN_ELEMENT_ID",
              message: `elementId "${action.elementId}" 不属于当前 Scene 的 slide`,
            });
          }
        }
        break;
      }
      case "INTERACT": {
        // INV-4：choices 只在 quiz / poll 时存在
        if (action.choices !== undefined) {
          if (action.kind !== "quiz" && action.kind !== "poll") {
            issues.push({
              path: `${base}.choices`,
              code: "INVALID_CHOICES",
              message: `kind="${action.kind}" 的 INTERACT 不允许带 choices`,
            });
          } else if (action.kind === "quiz" && action.choices.length === 0) {
            issues.push({
              path: `${base}.choices`,
              code: "EMPTY_CHOICES",
              message: "quiz 类型的 INTERACT 至少需要一个选项",
            });
          }
        }
        break;
      }
      case "DISCUSS": {
        if (action.participantRoleIds.length === 0) {
          issues.push({
            path: `${base}.participantRoleIds`,
            code: "EMPTY_PARTICIPANTS",
            message: "DISCUSS 至少需要一位参与者",
          });
        }
        action.participantRoleIds.forEach((roleId, i) => {
          if (!roleIds.has(roleId)) {
            issues.push({
              path: `${base}.participantRoleIds[${i}]`,
              code: "UNKNOWN_ROLE_ID",
              message: `participantRoleId "${roleId}" 不存在于 Lesson.roles`,
            });
          }
        });
        if (action.maxRounds < action.minRounds) {
          issues.push({
            path: `${base}.maxRounds`,
            code: "INVALID_ROUNDS",
            message: `maxRounds (${action.maxRounds}) 不能小于 minRounds (${action.minRounds})`,
          });
        }
        break;
      }
      case "SLIDE": {
        // INV-6：slideId 若提供，必须是课程内真实存在的 slide
        if (action.slideId !== undefined && !knownSlideIds.has(action.slideId)) {
          issues.push({
            path: `${base}.slideId`,
            code: "UNKNOWN_SLIDE_ID",
            message: `slideId "${action.slideId}" 不存在于本 Lesson`,
          });
        }
        break;
      }
      case "SPEECH":
      case "WRITE":
      case "WAIT":
        break;
      default: {
        // 穷尽性保护：新增 Action 类型时这里会编译报错
        const _exhaustive: never = action;
        issues.push({
          path: `${base}.type`,
          code: "UNKNOWN_ACTION_TYPE",
          message: `未知 Action 类型：${JSON.stringify(_exhaustive)}`,
        });
      }
    }
  });
}

/** 校验 Lesson 的全部不变量。返回 issue 列表，空数组表示通过。 */
export function checkLessonInvariants(lesson: Lesson): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // INV-5：Role id 在 Lesson 内唯一
  const roleIds = new Set<string>();
  lesson.roles.forEach((role, i) => {
    if (roleIds.has(role.id)) {
      issues.push({
        path: `roles[${i}].id`,
        code: "DUPLICATE_ROLE_ID",
        message: `Role id 重复：${role.id}`,
      });
    }
    roleIds.add(role.id);
  });

  // 课程内所有已知 slide id（供 INV-6 使用）
  const knownSlideIds = new Set<string>();
  for (const scene of lesson.scenes) {
    if (scene.slide) knownSlideIds.add(scene.slide.id);
  }

  const seenSceneIds = new Set<string>();
  lesson.scenes.forEach((scene, i) => {
    // INV-1：scene.index 必须等于数组下标
    if (scene.index !== i) {
      issues.push({
        path: `scenes[${i}].index`,
        code: "INVALID_SCENE_INDEX",
        message: `Scene index 应为 ${i}，实际为 ${scene.index}`,
      });
    }
    if (seenSceneIds.has(scene.id)) {
      issues.push({
        path: `scenes[${i}].id`,
        code: "DUPLICATE_SCENE_ID",
        message: `Scene id 重复：${scene.id}`,
      });
    }
    seenSceneIds.add(scene.id);

    checkSceneActions(scene, i, roleIds, knownSlideIds, issues);
  });

  return issues;
}

/** 校验未知输入是否为合法 Lesson（schema + 不变量）。 */
export function validateLesson(input: unknown): ValidationResult<Lesson> {
  const parsed = LessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error) };
  }
  const issues = checkLessonInvariants(parsed.data);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: parsed.data };
}

/** 校验通过返回 Lesson，否则抛出 ValidationError。 */
export function assertValidLesson(input: unknown): Lesson {
  const result = validateLesson(input);
  if (!result.ok) throw new ValidationError(result.issues);
  return result.data;
}

/** 校验单个 Scene（不含跨 Scene 不变量）。 */
export function validateScene(
  input: unknown,
  context: { roleIds: ReadonlySet<string>; knownSlideIds: ReadonlySet<string> },
): ValidationResult<Scene> {
  const parsed = SceneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issuesFromZod(parsed.error) };

  const issues: ValidationIssue[] = [];
  checkSceneActions(
    parsed.data,
    parsed.data.index,
    context.roleIds,
    context.knownSlideIds,
    issues,
  );
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: parsed.data };
}

/** 校验单个 Action（用于 action_agent 产出的即时校验）。 */
export function validateAction(input: unknown): ValidationResult<Action> {
  const parsed = ActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issuesFromZod(parsed.error) };
  return { ok: true, data: parsed.data };
}
