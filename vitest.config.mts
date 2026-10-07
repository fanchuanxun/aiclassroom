import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // 更具体的别名必须排在前面
      {
        find: /^@aiclassroom\/llm\/testing$/,
        replacement: resolvePath("./packages/llm/src/testing/index.ts"),
      },
      {
        find: /^@aiclassroom\/types$/,
        replacement: resolvePath("./packages/types/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/llm$/,
        replacement: resolvePath("./packages/llm/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/agents$/,
        replacement: resolvePath("./packages/agents/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/prompts$/,
        replacement: resolvePath("./packages/prompts/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/ui$/,
        replacement: resolvePath("./packages/ui/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/tts$/,
        replacement: resolvePath("./packages/tts/src/index.ts"),
      },
      {
        find: /^@aiclassroom\/image-service$/,
        replacement: resolvePath("./packages/image-service/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    globals: false,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/web/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/testing/**", "**/index.ts"],
    },
  },
});
