import type { CollectionEntry } from "astro:content";
import { isPublishedEntry } from "./publishedContent";
import { canonicalPath } from "./site";

type SeriesEntry = CollectionEntry<"series">;
export type Chapter = CollectionEntry<"blog" | "notes" | "writings">;

export function chapterHref(chapter: Chapter) {
  return canonicalPath(`/${chapter.collection}/${chapter.id}`);
}

// 章节归属和顺序只存于文章，合集目录由此生成。
export function buildSeries(definitions: SeriesEntry[], posts: Chapter[]) {
  const byId = new Map(definitions.map((entry) => [entry.id, entry]));
  const chaptersBySeries = new Map<string, Chapter[]>();
  for (const post of posts) {
    const { series, seriesOrder } = post.data;
    if (!series && seriesOrder === undefined) continue;
    if (!series || !Number.isInteger(seriesOrder) || (seriesOrder ?? 0) <= 0)
      throw new Error(
        `文章 ${post.id} 必须同时设置 series 和正整数 seriesOrder`,
      );
    if (!byId.has(series))
      throw new Error(`文章 ${post.id} 引用了不存在的合集 ${series}`);
    const definition = byId.get(series)!;
    const literary = definition.data.kind === "literary";
    if (literary !== (post.collection === "writings"))
      throw new Error(
        `合集 ${series} 的类型与章节 ${post.collection}/${post.id} 不匹配`,
      );
    const chapters = chaptersBySeries.get(series) || [];
    if (chapters.some((chapter) => chapter.data.seriesOrder === seriesOrder))
      throw new Error(`合集 ${series} 的章节序号 ${seriesOrder} 重复`);
    chapters.push(post);
    chaptersBySeries.set(series, chapters);
  }

  return definitions
    .filter(isPublishedEntry)
    .flatMap((entry) => {
      const chapters = (chaptersBySeries.get(entry.id) || [])
        .filter(isPublishedEntry)
        .sort((a, b) => a.data.seriesOrder! - b.data.seriesOrder!);
      if (!chapters.length) return [];
      const dates = [
        entry.data.updated,
        entry.data.created,
        ...chapters.flatMap((chapter) => [
          chapter.data.updated,
          chapter.data.created,
        ]),
      ].filter((date): date is Date => date !== undefined);
      const updated = dates.length
        ? new Date(Math.max(...dates.map(Number)))
        : undefined;
      const href =
        entry.data.kind === "literary"
          ? canonicalPath(`/writings/works/${entry.id}`)
          : canonicalPath(`/series/${entry.id}`);
      return [{ entry, chapters, updated, href }];
    })
    .sort(
      (a, b) =>
        Number(b.updated || 0) - Number(a.updated || 0) ||
        a.entry.id.localeCompare(b.entry.id),
    );
}

export type ReadingSeries = ReturnType<typeof buildSeries>[number];

export function chapterTitle(title: string) {
  return title.replace(/^\[[^\]]+\]\s*EP\d+\s*/i, "");
}

export function chapterDisplayTitle(chapter: Chapter) {
  return chapter.collection === "writings" && chapter.data.chapterTitle
    ? chapter.data.chapterTitle
    : chapterTitle(chapter.data.title);
}

export function getChapterNavigation(
  series: ReadingSeries,
  current: Pick<Chapter, "id" | "collection">,
) {
  const index = series.chapters.findIndex(
    (chapter) =>
      chapter.id === current.id && chapter.collection === current.collection,
  );
  if (index < 0)
    throw new Error(
      `章节 ${current.collection}/${current.id} 不在合集 ${series.entry.id} 中`,
    );
  return {
    position: index + 1,
    previous: series.chapters[index - 1],
    next: series.chapters[index + 1],
  };
}

export type ReadingItem<T extends Chapter = Chapter> =
  | { kind: "entry"; entry: T; href: string; updated?: Date }
  | { kind: "series"; series: ReadingSeries; href: string; updated?: Date };

// 列表以作品/合集为单位，搜索和订阅仍可使用各章正文。
export function groupReadingEntries<T extends Chapter>(
  entries: T[],
  series: ReadingSeries[],
): ReadingItem<T>[] {
  const publicEntries = entries.filter(isPublishedEntry);
  const entryKeys = new Set(publicEntries.map(chapterHref));
  const groups = series.filter((item) =>
    item.chapters.some((chapter) => entryKeys.has(chapterHref(chapter))),
  );
  const groupedKeys = new Set(
    groups.flatMap((item) => item.chapters.map(chapterHref)),
  );
  const items: ReadingItem<T>[] = [
    ...publicEntries
      .filter((entry) => !groupedKeys.has(chapterHref(entry)))
      .map((entry) => ({
        kind: "entry" as const,
        entry,
        href: chapterHref(entry),
        updated: entry.data.updated || entry.data.created,
      })),
    ...groups.map((item) => ({
      kind: "series" as const,
      series: item,
      href: item.href,
      updated: item.updated,
    })),
  ];
  return items.sort(
    (a, b) =>
      Number(b.updated || 0) - Number(a.updated || 0) ||
      a.href.localeCompare(b.href),
  );
}
