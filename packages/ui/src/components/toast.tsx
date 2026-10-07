"use client";

// 轻量 toast：Radix Toast 原语 + 模块级 store（无需 Context 包裹即可调用）
import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../utils";

export type ToastVariant = "default" | "error" | "success";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let counter = 0;

function emit(): void {
  for (const listener of listeners) listener(items);
}

export function toast(input: {
  title: string;
  description?: string;
  variant?: ToastVariant;
}): string {
  counter += 1;
  const id = `toast-${counter}`;
  items = [
    ...items,
    {
      id,
      title: input.title,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      variant: input.variant ?? "default",
    },
  ];
  emit();
  return id;
}

export function dismissToast(id: string): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function useToasts(): ToastItem[] {
  const [state, setState] = React.useState<ToastItem[]>(items);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

const variantClass: Record<ToastVariant, string> = {
  default: "border-slate-200 bg-white text-slate-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export function Toaster() {
  const toasts = useToasts();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          duration={item.variant === "error" ? 8000 : 4000}
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id);
          }}
          className={cn(
            "flex w-80 items-start gap-3 rounded-xl border p-4 shadow-lg",
            variantClass[item.variant],
          )}
        >
          <div className="flex-1">
            <ToastPrimitive.Title className="text-sm font-semibold">
              {item.title}
            </ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-1 text-xs opacity-80">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close className="rounded p-0.5 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
