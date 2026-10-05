import { getEntries } from "./contentParser";
import { slugify } from "./textConverter";
import type { CollectionKey } from "astro:content";
import { sortByDate } from "./sortFunctions";
import { getPageSize } from "./config";

export const getTaxa = async (collection: CollectionKey, name: string) => {
  const entries = await getEntries(collection);
  const taxonomyPages = entries.map((entry: any) => entry.data[name]);
  let taxonomies: string[] = [];
  for (let i = 0; i < taxonomyPages.length; i++) {
    const categoryArray = taxonomyPages[i];
    if (categoryArray && Array.isArray(categoryArray)) {
      for (let j = 0; j < categoryArray.length; j++) {
        taxonomies.push(slugify(categoryArray[j]));
      }
    }
  }
  const taxonomy = [...new Set(taxonomies)];
  taxonomy.sort((a, b) => a.localeCompare(b));
  return taxonomy;
};

export const getTaxaMultiset = async (
  collection: CollectionKey,
  name: string,
) => {
  const entries = await getEntries(collection);
  const taxonomyPages = entries.map((entry: any) => entry.data[name]);
  let taxonomies: string[] = [];
  for (let i = 0; i < taxonomyPages.length; i++) {
    const categoryArray = taxonomyPages[i];
    if (categoryArray && Array.isArray(categoryArray)) {
      for (let j = 0; j < categoryArray.length; j++) {
        taxonomies.push(slugify(categoryArray[j]));
      }
    }
  }
  return taxonomies;
};

export const getTaxaWithCount = async (
  collection: CollectionKey,
  name: string,
) => {
  const entries = await getEntries(collection);
  const taxonomyStats = new Map<string, number>();

  entries.forEach((entry: any) => {
    const taxonomyValue = entry.data[name];
    if (taxonomyValue) {
      if (Array.isArray(taxonomyValue)) {
        taxonomyValue.forEach((item: string) => {
          const key = item.toString();
          taxonomyStats.set(key, (taxonomyStats.get(key) || 0) + 1);
        });
      } else {
        const key = taxonomyValue.toString();
        taxonomyStats.set(key, (taxonomyStats.get(key) || 0) + 1);
      }
    }
  });

  return Array.from(taxonomyStats.entries())
    .map(([name, count]) => ({
      name,
      slug: slugify(name),
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// 分类与标签共用正文筛选和 slug 规则，避免生成重复路由。
export const getBlogTaxonomyPaths = async (taxonomy: "categories" | "tags") => {
  const entries = await getEntries("blog", sortByDate);
  const taxa = [
    ...new Set(
      entries.flatMap((entry) => entry.data[taxonomy] || []).filter(Boolean),
    ),
  ];
  const slugs = [...new Set(taxa.map((taxon) => slugify(taxon)))];

  return slugs.map((slug) => ({
    params: { slug },
    props: {
      taxon: taxa.find((taxon) => slugify(taxon) === slug),
      entries: entries.filter((entry) =>
        entry.data[taxonomy]?.some((taxon) => slugify(taxon) === slug),
      ),
    },
  }));
};

// 标签首屏与后续分页使用同一份筛选结果和完整内容元数据。
export async function getNotesTagPages() {
  const notes = await getEntries("notes", sortByDate);
  const tags = [...new Set(notes.flatMap((note) => note.data.tags || []))].sort(
    (a, b) => a.localeCompare(b),
  );
  const size = getPageSize("notes");
  return tags.flatMap((tag) => {
    const slug = slugify(tag);
    const entries = notes.filter((note) => note.data.tags?.includes(tag));
    const pageCount = Math.ceil(entries.length / size);
    return Array.from({ length: pageCount }, (_, index) => ({
      params: { slug, page: String(index + 1) },
      props: {
        entryIndex: {
          id: `tags/${slug}`,
          collection: "notes" as const,
          data: {
            title: tag,
            description: `${tag} 相关的技术笔记。`,
            draft: false,
          },
        },
        entries: entries.slice(index * size, (index + 1) * size),
        tags,
        pageIndex: index + 1,
        pageCount,
        allNotesCount: entries.length,
        basePath: `/notes/tags/${slug}`,
      },
    }));
  });
}
