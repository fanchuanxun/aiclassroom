// @spec docs/TECH-STACK.md §A.3
// Tailwind 4 使用 @tailwindcss/postcss 插件，不再需要 tailwind.config.js。
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
