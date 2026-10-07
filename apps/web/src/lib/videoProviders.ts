"use client";

import { create } from "zustand";
import type { VideoProviderConfig } from "@aiclassroom/types";
import {
  listVideoProviders,
  saveVideoProvider,
  deleteVideoProvider,
  setActiveVideoProvider,
} from "@aiclassroom/db";
import { createId } from "@aiclassroom/types";

interface VideoProvidersState {
  providers: VideoProviderConfig[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (cfg: VideoProviderConfig) => Promise<void>;
  update: (cfg: VideoProviderConfig) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

export const useVideoProviders = create<VideoProvidersState>((set) => ({
  providers: [],
  loaded: false,
  load: async () => {
    const providers = await listVideoProviders();
    set({ providers, loaded: true });
  },
  add: async (cfg) => {
    await saveVideoProvider(cfg);
    set({ providers: await listVideoProviders() });
  },
  update: async (cfg) => {
    await saveVideoProvider(cfg);
    set({ providers: await listVideoProviders() });
  },
  remove: async (id) => {
    await deleteVideoProvider(id);
    let providers = await listVideoProviders();
    if (!providers.some((p) => p.enabled) && providers.length > 0) {
      await setActiveVideoProvider(providers[0]!.id);
      providers = await listVideoProviders();
    }
    set({ providers });
  },
  setActive: async (id) => {
    await setActiveVideoProvider(id);
    set({ providers: await listVideoProviders() });
  },
}));

export function newVideoProvider(
  name: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): VideoProviderConfig {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: name.trim() || "自定义视频 API",
    adapter: "openai-compatible-video",
    apiKey,
    baseUrl,
    model,
    enabled: false,
    createdAt: now,
    updatedAt: now,
  };
}
