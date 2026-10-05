import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionEntry } from "astro:content";
import {
  buildSeries,
  chapterHref,
  chapterDisplayTitle,
  getChapterNavigation,
  groupReadingEntries,
} from "./seriesModel";

const definition = (
  id = "epoll",
  draft = false,
  kind: "technical" | "literary" = "technical",
): CollectionEntry<"series"> => ({
  id,
  collection: "series",
  data: { title: id, description: "合集介绍", draft, kind },
});

const writing = (
  id: string,
  order?: number,
  series?: string,
): CollectionEntry<"writings"> => ({
  id,
  collection: "writings",
  data: {
    title: `小说 EP${order || ""}`,
    chapterTitle: id,
    draft: false,
    series,
    seriesOrder: order,
    genre: "小说",
  },
});
const chapter = (
  id: string,
  order?: number,
  options: { series?: string; draft?: boolean; created?: Date } = {},
): CollectionEntry<"blog"> => ({
  id,
  collection: "blog",
  data: {
    title: id,
    categories: [],
    draft: options.draft ?? false,
    series: options.series ?? "epoll",
    seriesOrder: order,
    created: options.created,
  },
});

test("阅读顺序不受发布日期影响，草稿不进入目录，更新时间取公开章节", () => {
  const result = buildSeries(
    [definition()],
    [
      chapter("last", 3, { created: new Date("2026-01-01") }),
      chapter("draft", 2, { draft: true, created: new Date("2026-03-01") }),
      chapter("first", 1, { created: new Date("2026-02-01") }),
    ],
  );
  assert.deepEqual(
    result[0].chapters.map((entry) => entry.id),
    ["first", "last"],
  );
  assert.equal(result[0].updated?.toISOString(), "2026-02-01T00:00:00.000Z");
});

test("空合集和草稿合集不生成公开入口", () => {
  assert.deepEqual(buildSeries([definition()], []), []);
  assert.deepEqual(
    buildSeries([definition("epoll", true)], [chapter("first", 1)]),
    [],
  );
});

test("文章与笔记共享阅读顺序，链接指向各自的正文入口", () => {
  const note: CollectionEntry<"notes"> = {
    id: "basics",
    collection: "notes",
    data: { title: "基础练习", draft: false, series: "epoll", seriesOrder: 1 },
  };
  const post = chapter("voting", 2);
  const result = buildSeries([definition()], [post, note]);
  assert.deepEqual(result[0].chapters.map(chapterHref), [
    "/notes/basics/",
    "/blog/voting/",
  ]);
  assert.throws(
    () => buildSeries([definition()], [note, chapter("duplicate", 1)]),
    /重复/,
  );
});

test("未知合集、重复序号和缺失序号阻止生成错误目录", () => {
  assert.throws(() => buildSeries([], [chapter("first", 1)]), /不存在的合集/);
  assert.throws(
    () =>
      buildSeries([definition()], [chapter("first", 1), chapter("second", 1)]),
    /重复/,
  );
  assert.throws(
    () => buildSeries([definition()], [chapter("first")]),
    /正整数/,
  );
});

test("文学作品使用独立目录地址，章节顺序与前后导航遵循同一规则", () => {
  const first = writing("opening", 1, "novel");
  const last = writing("ending", 10, "novel");
  const [series] = buildSeries(
    [definition("novel", false, "literary")],
    [last, first],
  );
  assert.equal(series.href, "/writings/works/novel/");
  assert.deepEqual(series.chapters.map(chapterHref), [
    "/writings/opening/",
    "/writings/ending/",
  ]);
  assert.equal(chapterDisplayTitle(first), "opening");
  const start = getChapterNavigation(series, first);
  assert.equal(start.position, 1);
  assert.equal(start.previous, undefined);
  assert.equal(start.next?.id, "ending");
  assert.equal(getChapterNavigation(series, last).next, undefined);
});

test("章节归属拒绝把文学作品与技术合集混用", () => {
  assert.throws(
    () => buildSeries([definition()], [writing("opening", 1, "epoll")]),
    /类型.*不匹配/,
  );
  assert.throws(
    () =>
      buildSeries(
        [definition("epoll", false, "literary")],
        [chapter("first", 1)],
      ),
    /类型.*不匹配/,
  );
  assert.throws(
    () =>
      buildSeries(
        [definition("novel", false, "literary")],
        [writing("first", 0, "novel")],
      ),
    /正整数/,
  );
});

test("列表聚合一部小说，独立文字仍保留，标签筛选不会把作品拆成章节", () => {
  const chapters = [
    writing("opening", 1, "novel"),
    writing("ending", 2, "novel"),
  ];
  const essay = writing("essay");
  const series = buildSeries(
    [definition("novel", false, "literary")],
    chapters,
  );
  const items = groupReadingEntries([...chapters, essay], series);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.href).sort(), [
    "/writings/essay/",
    "/writings/works/novel/",
  ]);
  const filtered = groupReadingEntries([chapters[1]], series);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, "series");
  if (filtered[0].kind === "series")
    assert.equal(filtered[0].series.chapters.length, 2);
});

test("跨集合的同名文件不混淆列表去重、当前章节或前后导航", () => {
  const post = chapter("same", 1);
  const note: CollectionEntry<"notes"> = {
    id: "same",
    collection: "notes",
    data: { title: "笔记", draft: false, series: "epoll", seriesOrder: 2 },
  };
  const [series] = buildSeries([definition()], [post, note]);
  assert.equal(getChapterNavigation(series, note).position, 2);
  assert.equal(getChapterNavigation(series, note).previous?.collection, "blog");
  assert.equal(
    groupReadingEntries([post, writing("same")], [series]).length,
    2,
  );
  assert.throws(
    () => getChapterNavigation(series, writing("same")),
    /不在合集/,
  );
});

test("目录介绍文件和草稿不进入独立列表，草稿章节日期不影响作品更新", () => {
  const publicChapter = writing("opening", 1, "novel");
  publicChapter.data.created = new Date("2025-12-01");
  const draft = writing("unpublished", 2, "novel");
  draft.data.draft = true;
  draft.data.updated = new Date("2026-12-01");
  const series = buildSeries(
    [definition("novel", false, "literary")],
    [publicChapter, draft],
  );
  assert.equal(series[0].updated?.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(
    groupReadingEntries([publicChapter, draft, writing("-index")], series)
      .length,
    1,
  );
});
