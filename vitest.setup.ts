// Vitest 全局 setup。
// fake-indexeddb 让 Dexie 能在 Node 环境下测试（真实 IndexedDB 语义，非业务 Mock）。
import "fake-indexeddb/auto";
