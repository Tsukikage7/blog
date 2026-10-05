// 正文入口统一排除草稿和目录介绍文件。
export const isPublishedEntry = (entry: {
  id: string;
  data: { draft?: boolean };
}): boolean =>
  !entry.data.draft &&
  entry.id.split("/").every((segment) => !segment.startsWith("-"));
