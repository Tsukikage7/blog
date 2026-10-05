import { getEntries, getIndex } from "./contentParser";
import { getSeries } from "./series";
import { groupReadingEntries } from "./seriesModel";
import { getPageSize } from "./config";

export async function getWritingsCatalog(tag?: string) {
  const [entries, series, index] = await Promise.all([
    getEntries("writings"),
    getSeries(),
    getIndex("writings"),
  ]);
  const selected = tag
    ? entries.filter((entry) => entry.data.tags?.includes(tag))
    : entries;
  const items = groupReadingEntries(selected, series);
  const tags = [
    ...new Set(entries.flatMap((entry) => entry.data.tags || [])),
  ].sort();
  const workCount = items.filter((item) => item.kind === "series").length;
  const standaloneCount = items.length - workCount;
  const countText =
    [
      workCount ? `${workCount} 部作品` : "",
      standaloneCount ? `${standaloneCount} 篇文字` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "0 篇文字";
  return {
    items,
    tags,
    index,
    countText,
    pageSize: getPageSize("writings") || 10,
  };
}

export type WritingItem = Awaited<
  ReturnType<typeof getWritingsCatalog>
>["items"][number];
