import {
  getEntry,
  getCollection,
  type CollectionKey,
  type CollectionEntry,
} from "astro:content";
import type { GenericEntry } from "@/types";
import { SITE_INFO } from "@lib/config";
import { isPublishedEntry } from "./publishedContent";
export { isPublishedEntry } from "./publishedContent";

let blogCount = -1;
let categoriesCount = -1;
let tagsCount = -1;
let totalWordCount: string | undefined;
const hasNotes =
  Object.keys(import.meta.glob("../content/notes/**/*.{md,mdx}")).length > 0;

export const getIndex = async (
  collection: CollectionKey,
): Promise<GenericEntry | undefined> => {
  if (collection === "notes" && !hasNotes) return undefined;
  const index = await getEntry(collection, "-index");
  return index as GenericEntry | undefined;
};

export const getEntries = async <C extends CollectionKey>(
  collection: C,
  sortFunction?: (array: CollectionEntry<C>[]) => CollectionEntry<C>[],
  noIndex = true,
): Promise<CollectionEntry<C>[]> => {
  if (collection === "notes" && !hasNotes) return [];
  let entries = await getCollection(collection, ({ data }) => !data.draft);
  entries = noIndex ? entries.filter(isPublishedEntry) : entries;
  entries = sortFunction ? sortFunction(entries) : entries;
  return entries;
};

export const getEntriesBatch = async (
  collections: CollectionKey[],
  sortFunction?: (array: any[]) => any[],
  noIndex = true,
): Promise<GenericEntry[]> => {
  const allCollections = await Promise.all(
    collections.map(async (collection) => {
      return await getEntries(collection, sortFunction, noIndex);
    }),
  );
  return allCollections.flat();
};

export const getGroups = async (
  collection: CollectionKey,
  sortFunction?: (array: any[]) => any[],
): Promise<GenericEntry[]> => {
  let entries = await getEntries(collection, sortFunction, false);
  entries = entries.filter((entry: GenericEntry) => {
    const segments = entry.id.split("/");
    return segments.length === 2 && segments[1] == "-index";
  });
  return entries;
};

export const getEntriesInGroup = async (
  collection: CollectionKey,
  groupSlug: string,
  sortFunction?: (array: any[]) => any[],
): Promise<GenericEntry[]> => {
  let entries = await getEntries(collection, sortFunction);
  entries = entries.filter((data: any) => {
    const segments = data.id.split("/");
    return (
      segments[0] === groupSlug &&
      segments.length > 1 &&
      segments[1] !== "-index"
    );
  });
  return entries;
};

export const getBlogCount = async (): Promise<number> => {
  if (blogCount !== -1) return blogCount;
  const entries = await getEntries("blog");
  blogCount = entries.length;
  return blogCount;
};

export const getCategoriesCount = async (): Promise<number> => {
  if (categoriesCount !== -1) return categoriesCount;
  try {
    const blogEntries = await getEntries("blog");
    const categories = new Set<string>();

    blogEntries.forEach((entry: any) => {
      if (entry.data.categories && Array.isArray(entry.data.categories)) {
        entry.data.categories.forEach((category: string) => {
          categories.add(category);
        });
      }

      if (entry.data.category) {
        categories.add(entry.data.category);
      }
    });

    categoriesCount = categories.size;
    return categoriesCount;
  } catch (error) {
    return 0;
  }
};

export const getTagsCount = async (): Promise<number> => {
  if (tagsCount !== -1) return tagsCount;
  try {
    const blogEntries = await getEntries("blog");
    const tags = new Set<string>();

    blogEntries.forEach((entry: any) => {
      if (entry.data.tags && Array.isArray(entry.data.tags)) {
        entry.data.tags.forEach((tag: string) => {
          tags.add(tag);
        });
      }
    });

    tagsCount = tags.size;
    return tagsCount;
  } catch (error) {
    return 0;
  }
};

const countWords = (text: string): number => {
  if (!text) return 0;

  const cleanText = text
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .replace(/\n+/g, " ")
    .trim();

  if (!cleanText) return 0;

  const chineseChars = cleanText.match(/[\u4e00-\u9fff]/g) || [];
  const englishText = cleanText.replace(/[\u4e00-\u9fff]/g, " ");
  const englishWords = englishText.match(/\b[a-zA-Z]+\b/g) || [];

  return chineseChars.length + englishWords.length;
};

export const getTotalWordCount = async (): Promise<string> => {
  if (totalWordCount !== undefined) return totalWordCount;
  try {
    const entries = await getEntriesBatch(["blog", "notes", "writings"]);
    const totalWords = entries.reduce(
      (total, entry) => total + countWords(entry.body || ""),
      0,
    );

    totalWordCount =
      totalWords >= 1000000
        ? `${(totalWords / 1000000).toFixed(1)}M`
        : totalWords >= 1000
          ? `${(totalWords / 1000).toFixed(1)}K`
          : String(totalWords);
    return totalWordCount;
  } catch (error) {
    console.error("Error calculating total word count:", error);
    return "0";
  }
};

export const getSiteRunningDays = (): number => {
  try {
    const startDate = new Date(SITE_INFO.START_DATE);
    const currentDate = new Date();
    const timeDiff = currentDate.getTime() - startDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    return Math.max(0, daysDiff);
  } catch (error) {
    console.error("Error calculating site running days:", error);
    return 0;
  }
};

export const getSiteStats = async () => {
  const [blogCount, categoriesCount, tagsCount, totalWords] = await Promise.all(
    [getBlogCount(), getCategoriesCount(), getTagsCount(), getTotalWordCount()],
  );

  const runningDays = getSiteRunningDays();
  const [notes, writings] = await Promise.all([
    getEntries("notes"),
    getEntries("writings"),
  ]);

  return {
    articles: blogCount,
    notes: notes.length,
    writings: writings.length,
    categories: categoriesCount,
    tags: tagsCount,
    totalWords: totalWords,
    runningDays: runningDays,
  };
};
