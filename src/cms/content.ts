import { parseDocument } from "yaml";
import { z } from "astro/zod";
import { createContentSchemas } from "../lib/contentSchemas";
import {
  COLLECTIONS,
  CmsError,
  type Collection,
  type Entry,
  type Metadata,
} from "./types";

export const MAX_SOURCE_BYTES = 1024 * 1024;
export function contentPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 240 ||
    !/^src\/content\/[a-z]+\/(?:[a-zA-Z0-9\u3400-\u9fff_-]+\/)*[a-zA-Z0-9\u3400-\u9fff_-]+\.mdx?$/.test(
      value,
    )
  )
    throw new CmsError(400, "内容路径不合法");
  const collection = value.split("/")[2];
  if (!(collection in COLLECTIONS)) throw new CmsError(400, "不支持的内容集合");
  if (
    ["about", "home", "social", "search", "terms"].includes(collection) &&
    value !== `src/content/${collection}/-index.md`
  )
    throw new CmsError(400, "这个页面只能编辑既有的 -index.md");
  if (
    collection === "series" &&
    !/^src\/content\/series\/[a-z0-9-]+\.md$/.test(value)
  )
    throw new CmsError(400, "合集标识需为小写英文、数字和连字符");
  return value;
}
export function splitSource(source: string) {
  if (
    typeof source !== "string" ||
    new TextEncoder().encode(source).length > MAX_SOURCE_BYTES
  )
    throw new CmsError(413, "文章最大为 1 MiB");
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    source,
  );
  if (!match)
    throw new CmsError(422, "文章必须包含 YAML frontmatter（以 --- 分隔）");
  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length)
    throw new CmsError(422, `YAML 格式错误：${document.errors[0].message}`);
  let data: Metadata;
  try {
    data = document.toJS({ maxAliasCount: 50 });
  } catch {
    throw new CmsError(422, "YAML 引用过多");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new CmsError(422, "frontmatter 必须为字段对象");
  return { data, body: source.slice(match[0].length), document };
}
// 修改常用字段时保留未知字段、YAML 注释和原始正文。
export function patchMetadata(source: string, changes: Metadata) {
  const { document, body } = splitSource(source);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") document.delete(key);
    else document.set(key, value);
  }
  return `---\n${document.toString()}---\n${body}`;
}
export function contentHref(path: string, data: Metadata) {
  const parts = path
    .replace(/^src\/content\//, "")
    .replace(/\.mdx?$/, "")
    .split("/");
  const collection = parts.shift()!;
  if (parts.at(-1) === "-index") parts.pop();
  if (collection === "series" && data.kind === "literary")
    return `/writings/works/${parts.join("/")}/`;
  return `/${[collection, ...parts].join("/")}/`;
}
export function entryFromSource(
  path: string,
  source: string,
  sha: string | null,
): Entry {
  try {
    const { data, body } = splitSource(source);
    return { path, source, sha, data, body, href: contentHref(path, data) };
  } catch (error) {
    return {
      path,
      source,
      sha,
      data: { title: path.split("/").at(-1) },
      body: source,
      href: "",
      error: error instanceof Error ? error.message : "文章解析失败",
    };
  }
}
export function validateSource(path: string, source: string) {
  contentPath(path);
  const { data } = splitSource(source);
  const schemas = createContentSchemas(() => z.string());
  const schemaKey =
    path.split("/")[2] === "social"
      ? "socialConfig"
      : (path.split("/")[2] as keyof typeof schemas);
  const validation = schemas[schemaKey].safeParse(data);
  if (!validation.success)
    throw new CmsError(
      422,
      validation.error.issues
        .map((issue) => `${issue.path.join(".") || "内容"}：${issue.message}`)
        .join("；"),
    );
  if (typeof data.title !== "string" || !data.title.trim())
    throw new CmsError(422, "标题不能为空");
  for (const key of [
    "description",
    "image",
    "genre",
    "series",
    "chapterTitle",
    "mood",
    "location",
  ])
    if (data[key] !== undefined && typeof data[key] !== "string")
      throw new CmsError(422, `${key} 必须为文本`);
  for (const key of ["created", "updated"]) {
    if (
      data[key] !== undefined &&
      (typeof data[key] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(data[key]) ||
        !Number.isFinite(Date.parse(data[key])))
    )
      throw new CmsError(422, `${key} 必须为有效日期`);
  }
  if (data.draft !== undefined && typeof data.draft !== "boolean")
    throw new CmsError(422, "draft 必须为 true 或 false");
  for (const key of ["tags", "categories"])
    if (
      data[key] !== undefined &&
      (!Array.isArray(data[key]) ||
        !(data[key] as unknown[]).every((item) => typeof item === "string"))
    )
      throw new CmsError(422, `${key} 必须为文本数组`);
  const collection = path.split("/")[2] as Collection;
  if (collection === "blog" && !Array.isArray(data.categories))
    throw new CmsError(422, "文章必须设置 categories 数组");
  if (collection === "series" && typeof data.description !== "string")
    throw new CmsError(422, "合集必须填写 description");
  if (
    data.kind !== undefined &&
    !["technical", "literary"].includes(String(data.kind))
  )
    throw new CmsError(422, "合集类型不合法");
  if (
    data.genre !== undefined &&
    !["小说", "短篇小说", "散文", "诗歌", "杂文", "随笔"].includes(
      String(data.genre),
    )
  )
    throw new CmsError(422, "创作体裁不合法");
  if (data.series !== undefined || data.seriesOrder !== undefined) {
    if (
      typeof data.series !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.series) ||
      !Number.isInteger(data.seriesOrder) ||
      Number(data.seriesOrder) < 1
    )
      throw new CmsError(422, "series 和正整数 seriesOrder 必须同时设置");
  }
  return data;
}
export function validateSeries(path: string, source: string, entries: Entry[]) {
  const data = validateSource(path, source);
  const candidate = entryFromSource(path, source, null);
  const all = [...entries.filter((entry) => entry.path !== path), candidate];
  for (const entry of all.filter((item) =>
    ["blog", "notes", "writings"].includes(item.path.split("/")[2]),
  )) {
    const { series, seriesOrder } = entry.data;
    if (!series && seriesOrder === undefined) continue;
    const definition = all.find(
      (item) => item.path === `src/content/series/${series}.md`,
    );
    if (!definition)
      throw new CmsError(422, `合集 ${series} 不存在，请先创建合集`);
    if (
      (definition.data.kind === "literary") !==
      entry.path.startsWith("src/content/writings/")
    )
      throw new CmsError(422, `合集 ${series} 与文章类型不匹配`);
    if (
      all.some(
        (item) =>
          item.path !== entry.path &&
          item.data.series === series &&
          item.data.seriesOrder === seriesOrder,
      )
    )
      throw new CmsError(422, `合集 ${series} 的章节序号 ${seriesOrder} 重复`);
  }
  return data;
}
export async function digest(source: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function newSource(collection: Collection, title = "未命名") {
  const lines = [
    `title: ${JSON.stringify(title)}`,
    `description: ""`,
    `created: ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" })}`,
    "draft: true",
  ];
  if (collection === "blog") lines.push("categories: []", "tags: []");
  if (collection === "series") lines.push("kind: technical");
  if (collection === "writings") lines.push("genre: 随笔", "tags: []");
  return `---\n${lines.join("\n")}\n---\n\n从这里开始写。\n`;
}
