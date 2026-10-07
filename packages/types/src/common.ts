// @spec docs/DATA-MODEL.md
// 基础公共类型：ID / ISO 时间 / Rect / TextStyle

import { z } from "zod";

/** 统一 ID：nanoid(12) 风格的非空字符串 */
export const IdSchema = z.string().min(1, "id 不能为空");
export type Id = z.infer<typeof IdSchema>;

/** ISO 8601 时间字符串 */
export const IsoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "必须是合法的 ISO 8601 时间字符串",
  });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** 归一化坐标矩形，取值 0~1 */
const unitNumber = z
  .number()
  .min(0, "归一化坐标不能小于 0")
  .max(1, "归一化坐标不能大于 1");

export const RectSchema = z.object({
  x: unitNumber,
  y: unitNumber,
  w: unitNumber,
  h: unitNumber,
});
export type Rect = z.infer<typeof RectSchema>;

export const TextStyleSchema = z.object({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  size: z.number().positive().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;
