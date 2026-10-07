// @spec docs/DATA-MODEL.md §3.2
"use client";

import type { Role } from "@aiclassroom/types";
import { cn } from "@aiclassroom/ui";

export function RoleChip({
  role,
  size = "md",
  active = false,
}: {
  role: Role;
  size?: "sm" | "md";
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border bg-white px-2 py-1",
        active ? "border-slate-900" : "border-slate-200",
        size === "sm" ? "text-xs" : "text-sm",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          size === "sm" ? "h-6 w-6 text-base" : "h-8 w-8 text-lg",
        )}
        style={{ background: `${role.color}22` }}
      >
        {role.avatarUrl}
      </span>
      <span className="font-medium text-slate-800">{role.name}</span>
      <span className="text-[10px] uppercase text-slate-400">{role.kind}</span>
    </div>
  );
}
