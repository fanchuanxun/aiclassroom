// @spec docs/AGENT-ARCHITECTURE.md §5
export * from "./outline";
export * from "./scene";
export * from "./action";

/** 把角色列表渲染成可注入 prompt 的文本 */
export function renderRoles(
  roles: ReadonlyArray<{
    id: string;
    name: string;
    kind: string;
    personality: string;
    promptPersona: string;
  }>,
): string {
  return roles
    .map(
      (role) =>
        `- id: ${role.id} | 姓名: ${role.name} | 身份: ${role.kind === "teacher" ? "老师" : "学生"}\n  人设: ${role.personality}\n  设定: ${role.promptPersona}`,
    )
    .join("\n");
}
