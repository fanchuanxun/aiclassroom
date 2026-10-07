// @spec docs/RUNTIME.md §5
// Web Speech API 实现（MVP）。SSR 安全：所有浏览器 API 延迟到调用时才访问。

import type { SpeakOptions, TtsProvider, TtsVoice } from "./provider";

type SpeechSynthesisLike = {
  getVoices(): Array<{ voiceURI: string; name: string; lang: string }>;
  speak(utterance: unknown): void;
  cancel(): void;
};

function getSynth(): SpeechSynthesisLike | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesisLike })
    .speechSynthesis;
  return synth ?? undefined;
}

export class WebSpeechTtsProvider implements TtsProvider {
  readonly id = "web-speech";

  isAvailable(): boolean {
    return getSynth() !== undefined;
  }

  listVoices(): TtsVoice[] {
    const synth = getSynth();
    if (!synth) return [];
    return synth.getVoices().map((voice) => ({
      id: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
    }));
  }

  speak(text: string, options: SpeakOptions = {}, signal?: AbortSignal): Promise<void> {
    const synth = getSynth();
    if (!synth) return Promise.resolve();

    type UtteranceCtor = new (text: string) => {
      rate: number;
      pitch: number;
      lang: string;
      voice: unknown;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const Ctor = (globalThis as unknown as {
      SpeechSynthesisUtterance?: UtteranceCtor;
    }).SpeechSynthesisUtterance;
    if (!Ctor) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const utterance = new Ctor(text);
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      if (options.lang) utterance.lang = options.lang;
      if (options.voiceURI) {
        const voice = synth
          .getVoices()
          .find((v) => v.voiceURI === options.voiceURI);
        if (voice) utterance.voice = voice;
      }

      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };

      const onAbort = (): void => {
        synth.cancel();
        finish();
      };

      utterance.onend = finish;
      utterance.onerror = finish;
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      synth.speak(utterance);
    });
  }

  cancel(): void {
    getSynth()?.cancel();
  }
}

/**
 * 降级实现：完全不发声，只走字幕。
 * 讲义要求「TTS 失败 → 降级到字幕 only 模式，不阻塞播放」。
 */
export class SilentTtsProvider implements TtsProvider {
  readonly id = "silent";
  isAvailable(): boolean {
    return true;
  }
  listVoices(): TtsVoice[] {
    return [];
  }
  async speak(): Promise<void> {
    return Promise.resolve();
  }
  cancel(): void {
    /* no-op */
  }
}

/** 按可用性选择 Provider：优先 Web Speech，不可用时降级静音 */
export function createDefaultTtsProvider(): TtsProvider {
  const webSpeech = new WebSpeechTtsProvider();
  return webSpeech.isAvailable() ? webSpeech : new SilentTtsProvider();
}
