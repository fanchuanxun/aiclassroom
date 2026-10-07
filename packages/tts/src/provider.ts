// @spec docs/RUNTIME.md §5
// TTS 抽象。MVP 用 Web Speech API，后续可替换为云端 TTS / 多角色语音。
// 关键：TTS 不得写死在 Classroom UI，必须走这层接口。

import type { VoiceConfig } from "@aiclassroom/types";

export interface TtsVoice {
  id: string;
  name: string;
  lang: string;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  voiceURI?: string;
  lang?: string;
}

export interface TtsProvider {
  readonly id: string;
  /** 当前环境是否可用（SSR / 无语音引擎时为 false） */
  isAvailable(): boolean;
  listVoices(): TtsVoice[];
  /** 朗读完成或被打断时 resolve */
  speak(text: string, options?: SpeakOptions, signal?: AbortSignal): Promise<void>;
  cancel(): void;
}

export function voiceConfigToOptions(voice: VoiceConfig): SpeakOptions {
  return {
    ...(voice.rate === undefined ? {} : { rate: voice.rate }),
    ...(voice.pitch === undefined ? {} : { pitch: voice.pitch }),
    ...(voice.voiceURI === undefined ? {} : { voiceURI: voice.voiceURI }),
    ...(voice.lang === undefined ? {} : { lang: voice.lang }),
  };
}
