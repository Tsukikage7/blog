import { getSeries } from "@lib/series";
import { groupReadingEntries } from "@lib/seriesModel";
import { getEntries, getIndex } from "@lib/contentParser";
import { getPageSize } from "@lib/config";
import { canonicalUrl } from "@lib/site";
import { escapeXml } from "@lib/xml";
import { slugify } from "@lib/textConverter";

export async function GET() {
  const urls = new Map<string, Date | undefined>();
  const add = (path: string, date?: Date) => {
    const url = canonicalUrl(path);
    const previous = urls.get(url);
    if (!urls.has(url) || (date && (!previous || date > previous)))
      urls.set(url, date);
  };
  add("/");
  add("/music/");
  add("/series/");
  const series = await getSeries();
  for (const item of series) add(item.href, item.updated);
  for (const collection of ["about", "terms"] as const) {
    const page = await getIndex(collection);
    if (page && !page.data.draft)
      add(`/${collection}/`, page.data.updated || page.data.created);
  }
  for (const collection of ["blog", "notes", "writings"] as const) {
    const posts = await getEntries(collection);
    if (!posts.length) continue;
    add(`/${collection}/`);
    const listCount =
      collection === "writings"
        ? groupReadingEntries(posts, series).length
        : posts.length;
    for (
      let page = 2;
      page <= Math.ceil(listCount / getPageSize(collection));
      page++
    )
      add(`/${collection}/${page}/`);
    const taxonomies =
      collection === "blog"
        ? (["categories", "tags"] as const)
        : (["tags"] as const);
    for (const taxonomy of taxonomies) {
      const groups = new Map<string, typeof posts>();
      for (const post of posts) {
        const values =
          taxonomy === "categories" && post.collection === "blog"
            ? post.data.categories
            : post.data.tags || [];
        for (const slug of new Set(
          values
            .filter(Boolean)
            .map((value) =>
              collection === "writings" ? value : slugify(value),
            ),
        )) {
          groups.set(slug, [...(groups.get(slug) || []), post]);
        }
      }
      if (groups.size) add(`/${collection}/${taxonomy}/`);
      for (const [slug, entries] of groups) {
        add(`/${collection}/${taxonomy}/${encodeURIComponent(slug)}/`);
        if (collection === "notes") {
          for (
            let page = 2;
            page <= Math.ceil(entries.length / getPageSize("notes"));
            page++
          )
            add(`/notes/tags/${encodeURIComponent(slug)}/${page}/`);
        }
      }
    }
    for (const post of posts)
      add(`/${collection}/${post.id}/`, post.data.updated || post.data.created);
  }
  const body = [...urls]
    .map(
      ([url, date]) =>
        `<url><loc>${escapeXml(url)}</loc>${date ? `<lastmod>${date.toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
