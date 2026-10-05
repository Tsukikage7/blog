import rss from "@astrojs/rss";
import { getEntries } from "./contentParser";
import { SITE_INFO } from "./config";
import { absoluteUrl, canonicalUrl, SITE_URL } from "./site";
import { plainify } from "./textConverter";
import { escapeXml } from "./xml";
import type { Chapter } from "./seriesModel";

export async function createContentFeed(options: {
  collections: Chapter["collection"][];
  label: string;
  path: string;
  limit?: number;
}) {
  const entries = (
    await Promise.all(
      options.collections.map((collection) => getEntries(collection)),
    )
  )
    .flat()
    .sort(
      (a, b) =>
        Number(b.data.updated || b.data.created || 0) -
        Number(a.data.updated || a.data.created || 0),
    )
    .slice(0, options.limit || 50);
  return rss({
    title: `${SITE_INFO.SITE_NAME} · ${options.label}`,
    description: `${SITE_INFO.SITE_NAME} 的${options.label}订阅`,
    site: SITE_URL,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      atom: "http://www.w3.org/2005/Atom",
    },
    customData: `<language>zh-CN</language><atom:link href="${absoluteUrl(options.path)}" rel="self" type="application/rss+xml" />`,
    items: entries.map((entry) => {
      const description = plainify(entry.data.description || entry.body || "")
        .replace(/\s+/g, " ")
        .slice(0, 200);
      const image =
        typeof entry.data.image === "string"
          ? entry.data.image
          : entry.data.image?.src;
      return {
        title: entry.data.title,
        description,
        pubDate: entry.data.created || entry.data.updated,
        link: canonicalUrl(`/${entry.collection}/${entry.id}`),
        categories:
          entry.collection === "blog" ? entry.data.categories : entry.data.tags,
        content: `<p>${escapeXml(description)}</p>${image ? `<img src="${escapeXml(absoluteUrl(image))}" alt="${escapeXml(entry.data.title)}" />` : ""}`,
        customData: `<dc:creator>${escapeXml(SITE_INFO.AUTHOR)}</dc:creator>`,
      };
    }),
  });
}
