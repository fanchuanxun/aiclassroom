// @spec docs/PLAN.md (Phase 1A)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@aiclassroom/ui";

const LINKS = [
  { href: "/", label: "主页" },
  { href: "/library", label: "课程库" },
  { href: "/settings", label: "设置" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="text-lg">🎓</span> AIClassRoom
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
