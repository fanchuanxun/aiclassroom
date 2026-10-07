// @spec docs/DATA-MODEL.md §3.4
// 幻灯片渲染：元素按归一化 region（0~1）绝对定位到容器内。
"use client";

import * as React from "react";
import type { Slide, SlideElement } from "@aiclassroom/types";
import { cn } from "@aiclassroom/ui";

function regionStyle(r: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}

function ElementView({ el, focused }: { el: SlideElement; focused: boolean }) {
  const base = cn(
    "absolute overflow-hidden rounded-lg p-2 text-slate-800",
    focused && "ring-4 ring-amber-400 ring-offset-2",
  );
  switch (el.kind) {
    case "text":
      return (
        <div style={regionStyle(el.region)} className={cn(base, "flex items-center")}>
          <span
            className="text-[clamp(14px,2.2vw,22px)] leading-snug"
            style={el.style?.color ? { color: el.style.color } : undefined}
          >
            {el.text}
          </span>
        </div>
      );
    case "list":
      return (
        <div style={regionStyle(el.region)} className={cn(base, "flex flex-col justify-center")}>
          <ol className={cn("list-disc space-y-1 pl-5 text-[clamp(13px,1.8vw,18px)]", el.ordered && "list-decimal")}>
            {el.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ol>
        </div>
      );
    case "code":
      return (
        <div style={regionStyle(el.region)} className={cn(base, "bg-slate-900")}>
          <pre className="overflow-auto whitespace-pre-wrap text-[clamp(11px,1.5vw,15px)] text-emerald-200">
            <code>{el.source}</code>
          </pre>
        </div>
      );
    case "image":
      return (
        <img
          src={el.src}
          alt={el.alt ?? ""}
          style={regionStyle(el.region)}
          className={cn(base, "object-contain")}
        />
      );
    case "shape":
      return (
        <div
          style={regionStyle(el.region)}
          className={cn(
            base,
            el.shape === "circle" && "rounded-full",
            el.shape === "arrow" && "bg-transparent",
            el.shape === "rect" && "bg-slate-200/60",
          )}
        />
      );
    default:
      return null;
  }
}

export function SlideView({
  slide,
  focusElementId,
}: {
  slide?: Slide;
  focusElementId?: string;
}) {
  if (!slide) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-white text-slate-400">
        暂无幻灯片
      </div>
    );
  }
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl bg-white shadow-sm"
      style={slide.background ? { background: slide.background } : undefined}
    >
      {slide.imageUrl ? (
        <img
          src={slide.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="relative h-full w-full">
      {slide.title ? (
        <div className="absolute left-6 top-4 max-w-[80%] text-xl font-bold text-slate-800">
          {slide.title}
        </div>
      ) : null}
      {slide.elements.map((el) => (
        <ElementView key={el.id} el={el} focused={el.id === focusElementId} />
      ))}
      </div>
    </div>
  );
}
