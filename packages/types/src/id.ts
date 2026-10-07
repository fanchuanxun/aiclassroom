// @spec docs/DATA-MODEL.md
// 统一 ID 生成：nanoid(12)

import { customAlphabet } from "nanoid";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 生成 12 位 ID（nanoid 字典） */
export const createId: () => string = customAlphabet(ALPHABET, 12);
