import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { existsSync } from "node:fs";
import { createContentSchemas } from "./lib/contentSchemas";

const about = defineCollection({
  loader: glob({ pattern: "-index.{md,mdx}", base: "./src/content/about" }),
  schema: ({ image }) => createContentSchemas(image).about,
});

const blog = defineCollection({
  loader: glob({ pattern: "**\/[^_]*.{md,mdx}", base: "./src/content/blog" }),
  schema: ({ image }) => createContentSchemas(image).blog,
});

const series = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/series" }),
  schema: createContentSchemas(() => z.string()).series,
});

const categories = defineCollection({
  loader: glob({
    pattern: "**\/[^_]*.{md,mdx}",
    base: "./src/content/categories",
  }),
  schema: ({ image }) => createContentSchemas(image).categories,
});

const tags = defineCollection({
  loader: glob({ pattern: "**\/[^_]*.{md,mdx}", base: "./src/content/tags" }),
  schema: createContentSchemas(() => z.string()).tags,
});

const notes = defineCollection({
  loader: existsSync(new URL("./content/notes", import.meta.url))
    ? glob({ pattern: "**\/[^_]*.{md,mdx}", base: "./src/content/notes" })
    : async () => [],
  schema: ({ image }) => createContentSchemas(image).notes,
});

const home = defineCollection({
  loader: glob({ pattern: "-index.{md,mdx}", base: "./src/content/home" }),
  schema: ({ image }) => createContentSchemas(image).home,
});

const search = defineCollection({
  loader: glob({ pattern: "-index.{md,mdx}", base: "./src/content/search" }),
  schema: createContentSchemas(() => z.string()).search,
});

const socialConfig = defineCollection({
  loader: glob({ pattern: "-index.{md,mdx}", base: "./src/content/social" }),
  schema: createContentSchemas(() => z.string()).socialConfig,
});

const terms = defineCollection({
  loader: glob({ pattern: "-index.{md,mdx}", base: "./src/content/terms" }),
  schema: createContentSchemas(() => z.string()).terms,
});

// 文学创作集合 - 短篇小说、散文等
const writings = defineCollection({
  loader: glob({
    pattern: "**\/[^_]*.{md,mdx}",
    base: "./src/content/writings",
  }),
  schema: ({ image }) => createContentSchemas(image).writings,
});

export const collections = {
  series,
  about,
  blog,
  categories,
  tags,
  notes,
  home,
  search,
  social: socialConfig,
  terms,
  writings,
};
