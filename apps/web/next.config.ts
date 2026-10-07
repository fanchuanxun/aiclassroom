// @spec docs/ARCHITECTURE.md
// Next.js 配置。所有 workspace 包都是 TS 源码，必须交给 Next 转译。
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@aiclassroom/types",
    "@aiclassroom/llm",
    "@aiclassroom/agents",
    "@aiclassroom/prompts",
    "@aiclassroom/ui",
    "@aiclassroom/tts",
    "@aiclassroom/db",
    "@aiclassroom/runtime",
  ],
  // AI SDK 与 provider 适配器均为 ESM，交给打包器原样处理
  serverExternalPackages: [],
};

export default nextConfig;
