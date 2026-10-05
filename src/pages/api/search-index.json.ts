import { getEntriesBatch, getIndex } from "@lib/contentParser";
import { plainify } from "@lib/textConverter";
import { canonicalPath } from "@lib/site";
import type { SearchDocument } from "@/types/search";
import { getSeries } from "@lib/series";
import { chapterDisplayTitle } from "@lib/seriesModel";

export async function GET() {
  const entries = await getEntriesBatch(["blog", "notes", "writings"]);
  const about = await getIndex("about");
  if (about && !about.data.draft) entries.push(about);
  const documents: SearchDocument[] = entries.map((entry) => {
    const text = plainify(entry.body || "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      url: canonicalPath(
        `/${entry.collection}/${entry.id === "-index" ? "" : entry.id}`,
      ),
      title: entry.data.title,
      description: plainify(entry.data.description || text.slice(0, 120)),
      created: entry.data.created?.toISOString(),
      text,
    };
  });
  for (const series of await getSeries()) {
    documents.push({
      url: series.href,
      title: series.entry.data.title,
      description: series.entry.data.description,
      created: series.entry.data.created?.toISOString(),
      text: plainify(
        [
          series.entry.body || "",
          ...series.chapters.map(chapterDisplayTitle),
        ].join(" "),
      ),
    });
  }
  return new Response(JSON.stringify(documents), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
