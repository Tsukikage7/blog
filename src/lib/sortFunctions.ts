import type { GenericEntry } from "@/types";

export const sortByDate = <T extends GenericEntry>(entries: T[]): T[] => {
  const sortedEntries = entries.sort(
    (a: any, b: any) =>
      new Date(b.data.created || 0).valueOf() -
      new Date(a.data.created || 0).valueOf(),
  );
  return sortedEntries;
};

export const sortByUpdate = <T extends GenericEntry>(entries: T[]): T[] => {
  const sortedEntries = entries.sort(
    (a: any, b: any) =>
      new Date(b.data.updated || b.data.created || 0).valueOf() -
      new Date(a.data.updated || a.data.created || 0).valueOf(),
  );
  return sortedEntries;
};

export const sortByTitle = (entries: GenericEntry[]): GenericEntry[] => {
  const sortedEntries = entries.sort((a: any, b: any) =>
    a.data.title.localeCompare(b.data.title),
  );
  return sortedEntries;
};

export const sortByRandom = (entries: GenericEntry[]): GenericEntry[] => {
  const sortedEntries = entries.sort(() => Math.random() - 0.5);
  return sortedEntries;
};
