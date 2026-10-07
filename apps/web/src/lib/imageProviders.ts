"use client";

import { create } from "zustand";
import type { ImageProviderConfig } from "@aiclassroom/types";
import {
  listImageProviders,
  saveImageProvider,
  deleteImageProvider,
  setActiveImageProvider,
} from "@aiclassroom/db";
import { createId } from "@aiclassroom/types";

interface ImageProvidersState {
  providers: ImageProviderConfig[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (cfg: ImageProviderConfig) => Promise<void>;
  update: (cfg: ImageProviderConfig) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

export const useImageProviders = create<ImageProvidersState>((set) => ({
  providers: [],
  loaded: false,
  load: async () => {
    const providers = await listImageProviders();
    set({ providers, loaded: true });
  },
  add: async (cfg) => {
    await saveImageProvider(cfg);
    set({ providers: await listImageProviders() });
  },
  update: async (cfg) => {
    await saveImageProvider(cfg);
    set({ providers: await listImageProviders() });
  },
  remove: async (id) => {
    await deleteImageProvider(id);
    let providers = await listImageProviders();
    if (!providers.some((p) => p.enabled) && providers.length > 0) {
      await setActiveImageProvider(providers[0]!.id);
      providers = await listImageProviders();
    }
    set({ providers });
  },
  setActive: async (id) => {
    await setActiveImageProvider(id);
    set({ providers: await listImageProviders() });
  },
}));

export function newImageProvider(
  name: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): ImageProviderConfig {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: name.trim() || "自定义图片 API",
    adapter: "openai-compatible-images",
    apiKey,
    ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
    model: model.trim(),
    enabled: false,
    createdAt: now,
    updatedAt: now,
  };
}
