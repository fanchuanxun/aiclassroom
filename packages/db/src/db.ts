// @spec docs/DATA-MODEL.md §3 / docs/PLAN.md (Phase 3)
// Dexie 持久化层。只依赖 @aiclassroom/types，不感知任何 UI。

import Dexie, { type Table } from "dexie";
import type { ImageProviderConfig, Lesson, VideoProviderConfig } from "@aiclassroom/types";
// 复用 packages/llm 的 UserProviderConfig（仅类型，运行时零耦合、不引入 AI SDK）。
// 用户自定义 API Key 仅驻留此 IndexedDB 表，绝不进 localStorage / Lesson / corpus / trace / log / URL。
import type { UserProviderConfig } from "@aiclassroom/llm";

/** 落盘记录 = Lesson + 最后打开时间（用于历史排序，不进入领域模型） */
export interface LessonRecord extends Lesson {
  lastOpenedAt?: string;
}

/** userProviders 表记录 = UserProviderConfig 原样落盘 */
export type UserProviderRecord = UserProviderConfig;

export class AicDb extends Dexie {
  lessons!: Table<LessonRecord, string>;
  userProviders!: Table<UserProviderRecord, string>;
  imageProviders!: Table<ImageProviderConfig, string>;
  videoProviders!: Table<VideoProviderConfig, string>;

  constructor() {
    super("aiclassroom");
    this.version(1).stores({
      // 主键 id；其余为索引，仅用于列表排序与查询
      lessons: "id, status, updatedAt, title, lastOpenedAt",
    });
    this.version(2).stores({
      // 主键 id；enabled 用于快速定位当前 Provider，其余索引便于排序/查询
      userProviders: "id, enabled, providerId, name, updatedAt",
    });
    this.version(3).stores({
      // 主键 id；enabled 用于快速定位当前图片 Provider
      imageProviders: "id, enabled, adapter, name, updatedAt",
    });
    this.version(4).stores({
      // 主键 id；enabled 用于快速定位当前视频 Provider
      videoProviders: "id, enabled, adapter, name, updatedAt",
    });
  }
}

/**
 * 单例数据库。
 * 浏览器环境由全局 indexedDB 提供；测试环境由 fake-indexeddb/auto 注入。
 */
// 单例：避免 Next.js dev 热重载反复 new 实例导致 IndexedDB 连接异常
// （表现为偶发「保存失败 / 点了没反应」，刷新后又正常）。
const globalRef = globalThis as unknown as { __aiclassroomDb?: AicDb };
export const db = globalRef.__aiclassroomDb ?? (globalRef.__aiclassroomDb = new AicDb());

/** 从记录中提取纯 Lesson（剥离存储元数据） */
export function recordToLesson(rec: LessonRecord): Lesson {
  const { lastOpenedAt: _omit, ...lesson } = rec;
  return lesson;
}
