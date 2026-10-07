import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 标准 cn 工具：合并条件类名并消解 Tailwind 冲突 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
