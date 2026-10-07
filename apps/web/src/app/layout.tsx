// @spec docs/ARCHITECTURE.md
// 根布局：引入全局样式与 Toaster。
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@aiclassroom/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIClassRoom — AI 多智能体互动课堂",
  description:
    "输入教学主题，由真实多智能体流水线生成课程，并进入沉浸式互动课堂。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
