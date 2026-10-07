// @spec docs/PLAN.md (Phase 1C) / docs/TECH-STACK.md §21
// 浏览器端 TTS 适配器：Web Speech API。架构上保留 cloud TTS 替换位。
"use client";

export type SpeakFn = (
  roleId: string,
  text: string,
  opts: { rate?: number; pitch?: number; voiceURI?: string; lang?: string },
  signal?: AbortSignal,
) => Promise<void>;

/**
 * 创建 speak 函数。无 Web Speech 环境时退化为「短暂占位后 resolve」，
 * 不阻塞课堂进度（但仍会展示字幕）。
 */
export function createWebSpeechTts(): { speak: SpeakFn } {
  const synth: SpeechSynthesis | undefined =
    typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const hasUtterance =
    typeof window !== "undefined" && "SpeechSynthesisUtterance" in window;

  const speak: SpeakFn = (_roleId, text, opts, signal) =>
    new Promise<void>((resolve) => {
      if (!synth || !hasUtterance) {
        const ms = Math.min(2500, Math.max(400, text.length * 28));
        const t = setTimeout(resolve, ms);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
        return;
      }

      const u = new SpeechSynthesisUtterance(text);
      if (opts.lang) u.lang = opts.lang;
      if (opts.rate !== undefined) u.rate = opts.rate;
      if (opts.pitch !== undefined) u.pitch = opts.pitch;
      const voices = synth.getVoices();
      const pref = opts.lang?.split("-")[0] ?? "";
      const match = opts.voiceURI
        ? voices.find((v) => v.voiceURI === opts.voiceURI)
        : voices.find((v) => v.lang?.toLowerCase().startsWith(pref));
      if (match) u.voice = match;

      u.onend = () => resolve();
      u.onerror = () => resolve();
      signal?.addEventListener(
        "abort",
        () => {
          try {
            synth.cancel();
          } catch {
            /* ignore */
          }
          resolve();
        },
        { once: true },
      );

      try {
        synth.cancel();
        synth.speak(u);
      } catch {
        resolve();
      }
    });

  return { speak };
}

