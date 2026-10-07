// @spec docs/DATA-MODEL.md §3.4

import { z } from "zod";
import { IdSchema, RectSchema, TextStyleSchema } from "./common";

export const SlideElementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    id: IdSchema,
    text: z.string(),
    style: TextStyleSchema.optional(),
    region: RectSchema,
  }),
  z.object({
    kind: z.literal("image"),
    id: IdSchema,
    src: z.string().min(1),
    alt: z.string().optional(),
    region: RectSchema,
  }),
  z.object({
    kind: z.literal("list"),
    id: IdSchema,
    items: z.array(z.string()),
    ordered: z.boolean(),
    region: RectSchema,
  }),
  z.object({
    kind: z.literal("code"),
    id: IdSchema,
    language: z.string(),
    source: z.string(),
    region: RectSchema,
  }),
  z.object({
    kind: z.literal("shape"),
    id: IdSchema,
    shape: z.enum(["rect", "circle", "arrow"]),
    region: RectSchema,
  }),
]);
export type SlideElement = z.infer<typeof SlideElementSchema>;

export const SlideSchema = z.object({
  id: IdSchema,
  layout: z.enum([
    "title",
    "content",
    "two-column",
    "image",
    "quote",
    "custom",
  ]),
  title: z.string().optional(),
  elements: z.array(SlideElementSchema),
  /** 讲稿（导出 PPTX 时进备注区） */
  notes: z.string().optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  background: z.string().optional(),
});
export type Slide = z.infer<typeof SlideSchema>;
